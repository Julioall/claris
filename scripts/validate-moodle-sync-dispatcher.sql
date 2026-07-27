BEGIN;

DO $$
DECLARE
  v_site_id UUID := 'f7c320d5-1c39-4d69-906d-42289f6b92a4';
  v_user_id UUID := gen_random_uuid();
  v_connection_id UUID := gen_random_uuid();
  v_course_id UUID := gen_random_uuid();
  v_dispatch RECORD;
  v_claim_count INTEGER;
BEGIN
  INSERT INTO public.users (id, full_name, email)
  VALUES (v_user_id, 'Dispatcher integration test', 'dispatcher@example.invalid');

  INSERT INTO public.user_moodle_connections (
    id, user_id, moodle_site_id, alias, moodle_user_id, status
  ) VALUES (
    v_connection_id, v_user_id, v_site_id, 'Dispatcher test',
    'dispatcher-external-user', 'active'
  );

  INSERT INTO public.courses (id, moodle_site_id, moodle_course_id, name)
  VALUES (v_course_id, v_site_id, 'dispatcher-external-course', 'Dispatcher synthetic course');

  INSERT INTO public.user_course_catalog_eligibility (
    user_id, moodle_connection_id, course_id
  ) VALUES (v_user_id, v_connection_id, v_course_id);

  INSERT INTO public.moodle_sync_rollouts (moodle_site_id, capability, enabled)
  VALUES (v_site_id, 'freshness', TRUE);

  INSERT INTO public.moodle_course_sync_state (
    moodle_connection_id, course_id, temperature, reason_codes,
    last_full_sync_at, next_incremental_at
  ) VALUES (
    v_connection_id, v_course_id, 'cold', ARRAY['contract_fresh'],
    clock_timestamp(), clock_timestamp() - interval '1 minute'
  );

  INSERT INTO public.moodle_sync_watermarks (
    moodle_connection_id, course_id, entity, last_successful_sync_at
  ) VALUES
    (v_connection_id, v_course_id, 'students', clock_timestamp()),
    (v_connection_id, v_course_id, 'activities', clock_timestamp()),
    (v_connection_id, v_course_id, 'grades', clock_timestamp());

  SELECT * INTO v_dispatch
  FROM public.backend_dispatch_due_moodle_syncs(10);

  IF v_dispatch.dispatch_status <> 'fresh' OR v_dispatch.job_id IS NOT NULL THEN
    RAISE EXCEPTION 'Dispatcher did not advance a fresh course locally: %', row_to_json(v_dispatch);
  END IF;

  DELETE FROM public.moodle_sync_watermarks
  WHERE moodle_connection_id = v_connection_id AND course_id = v_course_id;

  UPDATE public.moodle_course_sync_state
  SET last_full_sync_at = NULL,
      next_incremental_at = clock_timestamp() - interval '1 minute'
  WHERE moodle_connection_id = v_connection_id AND course_id = v_course_id;

  SELECT * INTO v_dispatch
  FROM public.backend_dispatch_due_moodle_syncs(10);

  IF v_dispatch.dispatch_status <> 'queued' OR v_dispatch.job_id IS NULL THEN
    RAISE EXCEPTION 'Dispatcher did not enqueue the due reconciliation: %', row_to_json(v_dispatch);
  END IF;

  SELECT count(*) INTO v_claim_count
  FROM public.backend_claim_moodle_sync_item('dispatcher-contract-worker');
  IF v_claim_count <> 0 THEN
    RAISE EXCEPTION 'Disabled worker rollout claimed Moodle work';
  END IF;

  INSERT INTO public.moodle_sync_rollouts (moodle_site_id, capability, enabled)
  VALUES (v_site_id, 'worker', TRUE);

  SELECT count(*) INTO v_claim_count
  FROM public.backend_claim_moodle_sync_item('dispatcher-contract-worker');
  IF v_claim_count <> 1 THEN
    RAISE EXCEPTION 'Enabled worker rollout did not claim the due item';
  END IF;

  PERFORM public.backend_record_moodle_site_circuit_result(v_site_id, FALSE, 'moodle_server_error');
  PERFORM public.backend_record_moodle_site_circuit_result(v_site_id, FALSE, 'moodle_server_error');
  PERFORM public.backend_record_moodle_site_circuit_result(v_site_id, FALSE, 'moodle_server_error');

  SELECT count(*) INTO v_claim_count
  FROM public.backend_claim_moodle_sync_item('dispatcher-contract-worker');
  IF v_claim_count <> 0 THEN
    RAISE EXCEPTION 'Open Moodle site circuit still allowed a worker claim';
  END IF;

  RAISE NOTICE 'Moodle sync dispatcher integration passed';
END $$;

ROLLBACK;
