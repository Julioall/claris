BEGIN;

DO $$
DECLARE
  v_site_id UUID := 'f7c320d5-1c39-4d69-906d-42289f6b92a4';
  v_user_id UUID := gen_random_uuid();
  v_connection_id UUID := gen_random_uuid();
  v_course_id UUID := gen_random_uuid();
  v_job_id UUID;
  v_calls BIGINT;
  v_response_bytes BIGINT;
BEGIN
  INSERT INTO public.users (id, full_name, email)
  VALUES (v_user_id, 'Network metrics integration test', 'network-metrics@example.invalid');

  INSERT INTO public.user_moodle_connections (
    id, user_id, moodle_site_id, alias, moodle_user_id, status
  ) VALUES (
    v_connection_id, v_user_id, v_site_id, 'Network metrics test',
    'network-metrics-external-user', 'active'
  );

  INSERT INTO public.courses (id, moodle_site_id, moodle_course_id, name)
  VALUES (v_course_id, v_site_id, 'network-metrics-external-course', 'Network metrics synthetic course');

  INSERT INTO public.user_course_catalog_eligibility (
    user_id, moodle_connection_id, course_id
  ) VALUES (v_user_id, v_connection_id, v_course_id);

  v_job_id := public.backend_create_moodle_sync_job_v2(
    v_user_id,
    v_connection_id,
    gen_random_uuid(),
    'initial',
    ARRAY[v_course_id],
    ARRAY['students']::TEXT[],
    'manual',
    jsonb_build_array(
      jsonb_build_object(
        'item_key', 'students:' || v_course_id::TEXT,
        'label', 'Students',
        'metadata', jsonb_build_object('entity', 'students', 'course_id', v_course_id)
      ),
      jsonb_build_object(
        'item_key', 'risk',
        'label', 'Risk',
        'metadata', jsonb_build_object('entity', 'risk')
      )
    )
  );

  UPDATE public.background_job_items
  SET
    completed_at = clock_timestamp(),
    metadata = metadata || jsonb_build_object(
      'moodle_api_calls', 7,
      'moodle_response_bytes', 2048
    ),
    status = 'completed'
  WHERE job_id = v_job_id
    AND item_key = 'students:' || v_course_id::TEXT;

  SELECT metric_row.moodle_api_calls, metric_row.moodle_response_bytes
  INTO v_calls, v_response_bytes
  FROM public.backend_get_moodle_sync_operational_metrics(24, 300) metric_row
  WHERE metric_row.moodle_connection_id = v_connection_id;

  IF v_calls <> 7 OR v_response_bytes <> 2048 THEN
    RAISE EXCEPTION
      'Moodle network metrics projection did not preserve bounded counters: calls=%, bytes=%',
      v_calls,
      v_response_bytes;
  END IF;

  RAISE NOTICE 'Moodle sync network metrics integration passed';
END $$;

ROLLBACK;
