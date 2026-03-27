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
      'scheduled_at', NEW.scheduled_at
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

CREATE OR REPLACE FUNCTION public.delete_scheduled_message_background_job()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.background_jobs
  WHERE source_table = 'scheduled_messages'
    AND source_record_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS sync_scheduled_message_background_job_trigger ON public.scheduled_messages;
CREATE TRIGGER sync_scheduled_message_background_job_trigger
AFTER INSERT OR UPDATE ON public.scheduled_messages
FOR EACH ROW EXECUTE FUNCTION public.sync_scheduled_message_background_job();

DROP TRIGGER IF EXISTS delete_scheduled_message_background_job_trigger ON public.scheduled_messages;
CREATE TRIGGER delete_scheduled_message_background_job_trigger
AFTER DELETE ON public.scheduled_messages
FOR EACH ROW EXECUTE FUNCTION public.delete_scheduled_message_background_job();

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
    'scheduled_at', sm.scheduled_at
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

CREATE OR REPLACE FUNCTION public.sync_app_service_instance_job_background_job()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  resolved_user_id UUID;
  resolved_owner_user_id UUID;
  resolved_instance_name TEXT;
  resolved_service_type TEXT;
  resolved_status public.background_job_status;
  resolved_processed_items INTEGER;
BEGIN
  SELECT
    asi.owner_user_id,
    asi.name,
    asi.service_type
  INTO
    resolved_owner_user_id,
    resolved_instance_name,
    resolved_service_type
  FROM public.app_service_instances asi
  WHERE asi.id = NEW.instance_id;

  resolved_user_id := COALESCE(NEW.actor_user_id, resolved_owner_user_id);

  IF resolved_user_id IS NULL THEN
    DELETE FROM public.background_jobs
    WHERE source_table = 'app_service_instance_jobs'
      AND source_record_id = NEW.id;

    RETURN NEW;
  END IF;

  resolved_status := CASE NEW.status
    WHEN 'pending' THEN 'pending'::public.background_job_status
    WHEN 'processing' THEN 'processing'::public.background_job_status
    WHEN 'completed' THEN 'completed'::public.background_job_status
    WHEN 'failed' THEN 'failed'::public.background_job_status
    WHEN 'cancelled' THEN 'cancelled'::public.background_job_status
    ELSE 'pending'::public.background_job_status
  END;

  resolved_processed_items := CASE
    WHEN NEW.status IN ('completed', 'failed', 'cancelled') THEN 1
    ELSE 0
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
    resolved_user_id,
    'service_instance_job',
    'services',
    'app_service_instance_jobs',
    NEW.id,
    COALESCE(NULLIF(BTRIM(resolved_instance_name), ''), 'Job de servico'),
    CONCAT('Execucao ', REPLACE(NEW.job_type, '_', ' ')),
    resolved_status,
    1,
    resolved_processed_items,
    CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
    CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
    NEW.started_at,
    NEW.completed_at,
    NEW.error_summary,
    jsonb_strip_nulls(jsonb_build_object(
      'attempts', NEW.attempts,
      'background_activity_visibility', 'hidden',
      'correlation_id', NEW.correlation_id,
      'instance_id', NEW.instance_id,
      'instance_name', resolved_instance_name,
      'instance_scope', NEW.instance_scope,
      'job_type', NEW.job_type,
      'max_attempts', NEW.max_attempts,
      'payload', COALESCE(NEW.payload, '{}'::jsonb),
      'raw_status', NEW.status,
      'result', COALESCE(NEW.result, '{}'::jsonb),
      'scheduled_at', NEW.scheduled_at,
      'service_type', resolved_service_type
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

CREATE OR REPLACE FUNCTION public.delete_app_service_instance_job_background_job()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.background_jobs
  WHERE source_table = 'app_service_instance_jobs'
    AND source_record_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS sync_app_service_instance_job_background_job_trigger ON public.app_service_instance_jobs;
CREATE TRIGGER sync_app_service_instance_job_background_job_trigger
AFTER INSERT OR UPDATE ON public.app_service_instance_jobs
FOR EACH ROW EXECUTE FUNCTION public.sync_app_service_instance_job_background_job();

DROP TRIGGER IF EXISTS delete_app_service_instance_job_background_job_trigger ON public.app_service_instance_jobs;
CREATE TRIGGER delete_app_service_instance_job_background_job_trigger
AFTER DELETE ON public.app_service_instance_jobs
FOR EACH ROW EXECUTE FUNCTION public.delete_app_service_instance_job_background_job();

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
  asij.id,
  COALESCE(asij.actor_user_id, asi.owner_user_id) AS user_id,
  'service_instance_job',
  'services',
  'app_service_instance_jobs',
  asij.id,
  COALESCE(NULLIF(BTRIM(asi.name), ''), 'Job de servico'),
  CONCAT('Execucao ', REPLACE(asij.job_type, '_', ' ')),
  CASE asij.status
    WHEN 'pending' THEN 'pending'::public.background_job_status
    WHEN 'processing' THEN 'processing'::public.background_job_status
    WHEN 'completed' THEN 'completed'::public.background_job_status
    WHEN 'failed' THEN 'failed'::public.background_job_status
    WHEN 'cancelled' THEN 'cancelled'::public.background_job_status
    ELSE 'pending'::public.background_job_status
  END,
  1,
  CASE
    WHEN asij.status IN ('completed', 'failed', 'cancelled') THEN 1
    ELSE 0
  END,
  CASE WHEN asij.status = 'completed' THEN 1 ELSE 0 END,
  CASE WHEN asij.status = 'failed' THEN 1 ELSE 0 END,
  asij.started_at,
  asij.completed_at,
  asij.error_summary,
  jsonb_strip_nulls(jsonb_build_object(
    'attempts', asij.attempts,
    'background_activity_visibility', 'hidden',
    'correlation_id', asij.correlation_id,
    'instance_id', asij.instance_id,
    'instance_name', asi.name,
    'instance_scope', asij.instance_scope,
    'job_type', asij.job_type,
    'max_attempts', asij.max_attempts,
    'payload', COALESCE(asij.payload, '{}'::jsonb),
    'raw_status', asij.status,
    'result', COALESCE(asij.result, '{}'::jsonb),
    'scheduled_at', asij.scheduled_at,
    'service_type', asi.service_type
  )),
  asij.created_at,
  COALESCE(asij.updated_at, asij.created_at, NOW())
FROM public.app_service_instance_jobs asij
JOIN public.app_service_instances asi
  ON asi.id = asij.instance_id
WHERE COALESCE(asij.actor_user_id, asi.owner_user_id) IS NOT NULL
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
