-- Epic 8: browser clients no longer orchestrate Moodle syncs or mutate jobs.

CREATE UNIQUE INDEX IF NOT EXISTS idx_background_jobs_active_sync_request
  ON public.background_jobs(user_id, job_type, source_record_id)
  WHERE source = 'sync'
    AND source_record_id IS NOT NULL
    AND status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_background_jobs_sync_owner_updated
  ON public.background_jobs(user_id, updated_at DESC)
  WHERE source = 'sync';

REVOKE ALL ON TABLE public.background_jobs FROM anon, authenticated;
REVOKE ALL ON TABLE public.background_job_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.background_job_events FROM anon, authenticated;
GRANT ALL ON TABLE public.background_jobs TO service_role;
GRANT ALL ON TABLE public.background_job_items TO service_role;
GRANT ALL ON TABLE public.background_job_events TO service_role;

REVOKE ALL ON TABLE public.activity_feed FROM anon, authenticated;
GRANT ALL ON TABLE public.activity_feed TO service_role;

REVOKE ALL ON TABLE public.user_sync_preferences FROM anon, authenticated;
GRANT ALL ON TABLE public.user_sync_preferences TO service_role;

COMMENT ON INDEX public.idx_background_jobs_active_sync_request IS
  'Prevents concurrent duplicate Moodle sync jobs for the same actor and canonical request.';
