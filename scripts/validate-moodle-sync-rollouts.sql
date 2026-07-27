BEGIN;

DO $$
DECLARE
  v_site_id UUID := 'f7c320d5-1c39-4d69-906d-42289f6b92a4';
  v_primary_user UUID := gen_random_uuid();
  v_allowlisted_user UUID := gen_random_uuid();
  v_blocked_user UUID := gen_random_uuid();
BEGIN
  INSERT INTO public.users (id, full_name, email)
  VALUES
    (v_primary_user, 'Rollout primary test', 'rollout-primary@example.invalid'),
    (v_allowlisted_user, 'Rollout allowed test', 'rollout-allowed@example.invalid'),
    (v_blocked_user, 'Rollout blocked test', 'rollout-blocked@example.invalid');

  IF public.backend_moodle_sync_rollout_enabled(v_site_id, v_primary_user, 'worker') THEN
    RAISE EXCEPTION 'A missing site rollout must be disabled by default';
  END IF;

  INSERT INTO public.moodle_sync_rollouts (moodle_site_id, capability, enabled)
  VALUES (v_site_id, 'worker', TRUE);

  IF NOT public.backend_moodle_sync_rollout_enabled(v_site_id, v_primary_user, 'worker') THEN
    RAISE EXCEPTION 'An enabled site rollout without user rules must permit the site';
  END IF;

  INSERT INTO public.moodle_sync_rollouts (moodle_site_id, user_id, capability, enabled)
  VALUES
    (v_site_id, v_allowlisted_user, 'worker', TRUE),
    (v_site_id, v_blocked_user, 'worker', FALSE);

  IF NOT public.backend_moodle_sync_rollout_enabled(v_site_id, v_allowlisted_user, 'worker')
    OR public.backend_moodle_sync_rollout_enabled(v_site_id, v_primary_user, 'worker')
    OR public.backend_moodle_sync_rollout_enabled(v_site_id, v_blocked_user, 'worker') THEN
    RAISE EXCEPTION 'Per-user rollout allow-list semantics failed';
  END IF;

  UPDATE public.moodle_sync_rollouts
  SET enabled = FALSE
  WHERE moodle_site_id = v_site_id
    AND user_id IS NULL
    AND capability = 'worker';

  IF public.backend_moodle_sync_rollout_enabled(v_site_id, v_allowlisted_user, 'worker') THEN
    RAISE EXCEPTION 'The site kill switch did not override an enabled user rule';
  END IF;

  RAISE NOTICE 'Moodle sync rollout integration passed';
END $$;

ROLLBACK;
