ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS execution_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS result_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS execution_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_execution_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS executed_bulk_job_id UUID REFERENCES public.bulk_message_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due
  ON public.scheduled_messages(status, scheduled_at)
  WHERE status = 'pending';

COMMENT ON COLUMN public.scheduled_messages.execution_context IS
  'Structured snapshot with everything the scheduled message executor needs or the reason why automatic execution is blocked.';

COMMENT ON COLUMN public.scheduled_messages.result_context IS
  'Structured execution result payload for monitoring, troubleshooting and Hangfire-like observability.';

COMMENT ON COLUMN public.scheduled_messages.execution_attempts IS
  'How many times the scheduled message executor attempted to process this row.';

COMMENT ON COLUMN public.scheduled_messages.last_execution_at IS
  'Latest time the executor claimed or tried to process this scheduled message.';

COMMENT ON COLUMN public.scheduled_messages.executed_bulk_job_id IS
  'Optional link to the concrete bulk_message_job generated when the schedule is executed.';

UPDATE public.scheduled_messages
SET execution_context = jsonb_strip_nulls(jsonb_build_object(
  'schema_version', 1,
  'mode', 'legacy_placeholder',
  'channel', COALESCE(filter_context ->> 'channel', 'moodle'),
  'automatic_execution_supported', false,
  'blocking_reason', 'recipient_snapshot_missing',
  'created_via', 'scheduled_messages_tab',
  'whatsapp_instance_id', NULLIF(filter_context ->> 'whatsapp_instance_id', '')
))
WHERE execution_context = '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.sync_scheduled_message_background_job()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  resolved_total_items INTEGER;
  resolved_processed_items INTEGER;
  resolved_status public.background_job_status;
BEGIN
  resolved_total_items := COALESCE(
    NEW.recipient_count,
    GREATEST(COALESCE(NEW.sent_count, 0) + COALESCE(NEW.failed_count, 0), 0)
  );
  resolved_processed_items := GREATEST(COALESCE(NEW.sent_count, 0) + COALESCE(NEW.failed_count, 0), 0);
  resolved_status := CASE NEW.status
    WHEN 'pending' THEN 'pending'::public.background_job_status
    WHEN 'processing' THEN 'processing'::public.background_job_status
    WHEN 'sent' THEN 'completed'::public.background_job_status
    WHEN 'failed' THEN 'failed'::public.background_job_status
    ELSE 'cancelled'::public.background_job_status
  END;

  INSERT INTO public.background_jobs (
    id,
    user_id,
    job_type,
    source,
    source_table,
    source_record_id,
    title,
    description,
    status,
    total_items,
    processed_items,
    success_count,
    error_count,
    started_at,
    completed_at,
    error_message,
    metadata,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.user_id,
    'scheduled_message',
    'scheduler',
    'scheduled_messages',
    NEW.id,
    COALESCE(NULLIF(BTRIM(NEW.title), ''), 'Agendamento de mensagem'),
    NEW.message_content,
    resolved_status,
    GREATEST(resolved_total_items, 0),
    resolved_processed_items,
    GREATEST(COALESCE(NEW.sent_count, 0), 0),
    GREATEST(COALESCE(NEW.failed_count, 0), 0),
    NEW.started_at,
    NEW.completed_at,
    NEW.error_message,
    jsonb_strip_nulls(jsonb_build_object(
      'background_activity_visibility', 'hidden',
      'filter_context', COALESCE(NEW.filter_context, '{}'::jsonb),
      'notes', NEW.notes,
      'origin', NEW.origin,
      'scheduled_at', NEW.scheduled_at,
      'execution_context', COALESCE(NEW.execution_context, '{}'::jsonb),
      'result_context', COALESCE(NEW.result_context, '{}'::jsonb),
      'execution_attempts', NEW.execution_attempts,
      'last_execution_at', NEW.last_execution_at,
      'executed_bulk_job_id', NEW.executed_bulk_job_id
    )),
    NEW.created_at,
    COALESCE(NEW.updated_at, NEW.created_at, NOW())
  )
  ON CONFLICT (id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    job_type = EXCLUDED.job_type,
    source = EXCLUDED.source,
    source_table = EXCLUDED.source_table,
    source_record_id = EXCLUDED.source_record_id,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    total_items = EXCLUDED.total_items,
    processed_items = EXCLUDED.processed_items,
    success_count = EXCLUDED.success_count,
    error_count = EXCLUDED.error_count,
    started_at = EXCLUDED.started_at,
    completed_at = EXCLUDED.completed_at,
    error_message = EXCLUDED.error_message,
    metadata = EXCLUDED.metadata,
    created_at = EXCLUDED.created_at,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

INSERT INTO public.background_jobs (
  id,
  user_id,
  job_type,
  source,
  source_table,
  source_record_id,
  title,
  description,
  status,
  total_items,
  processed_items,
  success_count,
  error_count,
  started_at,
  completed_at,
  error_message,
  metadata,
  created_at,
  updated_at
)
SELECT
  sm.id,
  sm.user_id,
  'scheduled_message',
  'scheduler',
  'scheduled_messages',
  sm.id,
  COALESCE(NULLIF(BTRIM(sm.title), ''), 'Agendamento de mensagem'),
  sm.message_content,
  CASE sm.status
    WHEN 'pending' THEN 'pending'::public.background_job_status
    WHEN 'processing' THEN 'processing'::public.background_job_status
    WHEN 'sent' THEN 'completed'::public.background_job_status
    WHEN 'failed' THEN 'failed'::public.background_job_status
    ELSE 'cancelled'::public.background_job_status
  END,
  GREATEST(COALESCE(sm.recipient_count, COALESCE(sm.sent_count, 0) + COALESCE(sm.failed_count, 0)), 0),
  GREATEST(COALESCE(sm.sent_count, 0) + COALESCE(sm.failed_count, 0), 0),
  GREATEST(COALESCE(sm.sent_count, 0), 0),
  GREATEST(COALESCE(sm.failed_count, 0), 0),
  sm.started_at,
  sm.completed_at,
  sm.error_message,
  jsonb_strip_nulls(jsonb_build_object(
    'background_activity_visibility', 'hidden',
    'filter_context', COALESCE(sm.filter_context, '{}'::jsonb),
    'notes', sm.notes,
    'origin', sm.origin,
    'scheduled_at', sm.scheduled_at,
    'execution_context', COALESCE(sm.execution_context, '{}'::jsonb),
    'result_context', COALESCE(sm.result_context, '{}'::jsonb),
    'execution_attempts', sm.execution_attempts,
    'last_execution_at', sm.last_execution_at,
    'executed_bulk_job_id', sm.executed_bulk_job_id
  )),
  sm.created_at,
  COALESCE(sm.updated_at, sm.created_at, NOW())
FROM public.scheduled_messages sm
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  job_type = EXCLUDED.job_type,
  source = EXCLUDED.source,
  source_table = EXCLUDED.source_table,
  source_record_id = EXCLUDED.source_record_id,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  total_items = EXCLUDED.total_items,
  processed_items = EXCLUDED.processed_items,
  success_count = EXCLUDED.success_count,
  error_count = EXCLUDED.error_count,
  started_at = EXCLUDED.started_at,
  completed_at = EXCLUDED.completed_at,
  error_message = EXCLUDED.error_message,
  metadata = EXCLUDED.metadata,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at;
