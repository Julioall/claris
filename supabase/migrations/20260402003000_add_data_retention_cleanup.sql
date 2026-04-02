-- Migration: Epic 7 - Políticas de retenção para tabelas históricas
-- TTLs:
--   background_jobs / background_job_events : 90 dias (concluídos/falhos)
--   risk_history                            : 6 meses
--   activity_feed                           : 60 dias
--   student_sync_snapshots                  : 90 dias

-- Função de limpeza invocável via Edge Function ou pg_cron
CREATE OR REPLACE FUNCTION public.cleanup_old_records()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobs_deleted             INT := 0;
  v_job_events_deleted       INT := 0;
  v_risk_history_deleted     INT := 0;
  v_activity_feed_deleted    INT := 0;
  v_snapshots_deleted        INT := 0;
  v_cutoff_90d               TIMESTAMPTZ := NOW() - INTERVAL '90 days';
  v_cutoff_6m                TIMESTAMPTZ := NOW() - INTERVAL '6 months';
  v_cutoff_60d               TIMESTAMPTZ := NOW() - INTERVAL '60 days';
BEGIN
  -- background_job_events: apaga eventos de jobs concluídos/falhos com > 90 dias
  DELETE FROM public.background_job_events
   WHERE created_at < v_cutoff_90d
     AND job_id IN (
       SELECT id FROM public.background_jobs
        WHERE status IN ('completed', 'failed')
     );
  GET DIAGNOSTICS v_job_events_deleted = ROW_COUNT;

  -- background_jobs: apaga jobs concluídos/falhos com > 90 dias
  DELETE FROM public.background_jobs
   WHERE updated_at < v_cutoff_90d
     AND status IN ('completed', 'failed');
  GET DIAGNOSTICS v_jobs_deleted = ROW_COUNT;

  -- risk_history: apaga entradas com > 6 meses
  DELETE FROM public.risk_history
   WHERE created_at < v_cutoff_6m;
  GET DIAGNOSTICS v_risk_history_deleted = ROW_COUNT;

  -- activity_feed: apaga entradas com > 60 dias
  DELETE FROM public.activity_feed
   WHERE created_at < v_cutoff_60d;
  GET DIAGNOSTICS v_activity_feed_deleted = ROW_COUNT;

  -- student_sync_snapshots: apaga snapshots com > 90 dias
  DELETE FROM public.student_sync_snapshots
   WHERE synced_at < v_cutoff_90d;
  GET DIAGNOSTICS v_snapshots_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'background_jobs_deleted',       v_jobs_deleted,
    'background_job_events_deleted', v_job_events_deleted,
    'risk_history_deleted',          v_risk_history_deleted,
    'activity_feed_deleted',         v_activity_feed_deleted,
    'student_sync_snapshots_deleted', v_snapshots_deleted,
    'executed_at',                   NOW()
  );
END;
$$;

-- Apenas service_role pode executar a limpeza (não expor para authenticated)
REVOKE EXECUTE ON FUNCTION public.cleanup_old_records() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_records() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_old_records() TO service_role;

COMMENT ON FUNCTION public.cleanup_old_records() IS
  'Apaga registros históricos ultrapassando TTL: background_jobs (90d), risk_history (6m), activity_feed (60d), student_sync_snapshots (90d). '
  'Chamar via Edge Function data-cleanup agendada ou pg_cron.';
