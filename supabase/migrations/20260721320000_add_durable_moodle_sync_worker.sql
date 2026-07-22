-- Durable, service-only Moodle sync worker primitives.
-- Each RPC owns one atomic transition so Edge Functions can be short lived and
-- safely resumed by a durable dispatcher.

ALTER TABLE public.background_job_items
  ADD CONSTRAINT background_job_items_attempt_count_check
    CHECK (attempt_count >= 0),
  ADD CONSTRAINT background_job_items_max_attempts_check
    CHECK (max_attempts > 0),
  ADD CONSTRAINT background_job_items_lease_pair_check
    CHECK ((lease_owner IS NULL) = (leased_until IS NULL));

CREATE INDEX IF NOT EXISTS idx_background_job_items_active_lease
  ON public.background_job_items (leased_until, job_id)
  WHERE status = 'processing' AND leased_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moodle_sync_job_context_connection_job
  ON public.moodle_sync_job_context (moodle_connection_id, job_id);

CREATE OR REPLACE FUNCTION public.prevent_moodle_sync_job_context_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Moodle sync job context is immutable';
END;
$$;

DROP TRIGGER IF EXISTS prevent_moodle_sync_job_context_update
  ON public.moodle_sync_job_context;
CREATE TRIGGER prevent_moodle_sync_job_context_update
  BEFORE UPDATE ON public.moodle_sync_job_context
  FOR EACH ROW EXECUTE FUNCTION public.prevent_moodle_sync_job_context_update();

CREATE UNIQUE INDEX IF NOT EXISTS idx_background_job_events_moodle_terminal
  ON public.background_job_events (job_id)
  WHERE event_type IN ('job_completed', 'job_failed', 'job_cancelled');

CREATE OR REPLACE FUNCTION public.backend_finalize_moodle_sync_job(
  p_job_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job public.background_jobs%ROWTYPE;
  v_pending_count INTEGER;
  v_processing_count INTEGER;
  v_completed_count INTEGER;
  v_failed_count INTEGER;
  v_cancelled_count INTEGER;
  v_terminal_status public.background_job_status;
  v_completed_at TIMESTAMPTZ := clock_timestamp();
BEGIN
  SELECT job_row.*
  INTO v_job
  FROM public.background_jobs job_row
  WHERE job_row.id = p_job_id
    AND job_row.job_type = 'moodle_sync'
    AND job_row.source = 'sync'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_job.status IN ('completed', 'failed', 'cancelled') THEN
    RETURN v_job.status::TEXT;
  END IF;

  SELECT
    count(*) FILTER (WHERE item_row.status = 'pending'),
    count(*) FILTER (WHERE item_row.status = 'processing'),
    count(*) FILTER (WHERE item_row.status = 'completed'),
    count(*) FILTER (WHERE item_row.status = 'failed'),
    count(*) FILTER (WHERE item_row.status = 'cancelled')
  INTO
    v_pending_count,
    v_processing_count,
    v_completed_count,
    v_failed_count,
    v_cancelled_count
  FROM public.background_job_items item_row
  WHERE item_row.job_id = p_job_id;

  IF v_pending_count > 0 OR v_processing_count > 0 THEN
    UPDATE public.background_jobs
    SET
      processed_items = v_completed_count + v_failed_count + v_cancelled_count,
      success_count = v_completed_count,
      error_count = v_failed_count,
      updated_at = v_completed_at
    WHERE id = p_job_id;
    RETURN 'processing';
  END IF;

  v_terminal_status := CASE
    WHEN v_failed_count > 0 OR (v_completed_count + v_cancelled_count) = 0 THEN 'failed'::public.background_job_status
    ELSE 'completed'::public.background_job_status
  END;

  UPDATE public.background_jobs
  SET
    status = v_terminal_status,
    processed_items = v_completed_count + v_failed_count + v_cancelled_count,
    success_count = v_completed_count,
    error_count = v_failed_count,
    error_message = CASE
      WHEN v_terminal_status = 'failed' THEN format('%s etapa(s) falharam.', v_failed_count)
      ELSE NULL
    END,
    completed_at = v_completed_at,
    updated_at = v_completed_at
  WHERE id = p_job_id;

  INSERT INTO public.background_job_events (
    job_id,
    user_id,
    event_type,
    level,
    message,
    metadata
  )
  VALUES (
    p_job_id,
    v_job.user_id,
    CASE WHEN v_terminal_status = 'completed' THEN 'job_completed' ELSE 'job_failed' END,
    CASE WHEN v_terminal_status = 'completed' THEN 'info' ELSE 'error' END,
    CASE
      WHEN v_terminal_status = 'completed' THEN 'Sincronizacao Moodle concluida pelo worker duravel.'
      ELSE 'Sincronizacao Moodle concluida com erros pelo worker duravel.'
    END,
    jsonb_build_object(
      'error_count', v_failed_count,
      'success_count', v_completed_count,
      'schema_version', 2
    )
  )
  ON CONFLICT (job_id) WHERE event_type IN ('job_completed', 'job_failed', 'job_cancelled')
  DO NOTHING;

  IF v_terminal_status = 'completed' THEN
    UPDATE public.users
    SET last_sync = v_completed_at
    WHERE id = v_job.user_id;
  END IF;

  RETURN v_terminal_status::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_claim_moodle_sync_item(
  p_worker_id TEXT,
  p_job_id UUID DEFAULT NULL,
  p_lease_seconds INTEGER DEFAULT 60,
  p_max_connection_leases INTEGER DEFAULT 2,
  p_max_site_leases INTEGER DEFAULT 4
)
RETURNS TABLE (
  item_id UUID,
  job_id UUID,
  user_id UUID,
  item_key TEXT,
  label TEXT,
  item_metadata JSONB,
  item_cursor JSONB,
  attempt_count INTEGER,
  max_attempts INTEGER,
  leased_until TIMESTAMPTZ,
  job_metadata JSONB,
  moodle_connection_id UUID,
  moodle_site_id UUID,
  sync_policy JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_exhausted_job_id UUID;
BEGIN
  IF p_worker_id IS NULL OR btrim(p_worker_id) = '' OR length(p_worker_id) > 160 THEN
    RAISE EXCEPTION 'Invalid worker id' USING ERRCODE = '22023';
  END IF;
  IF p_lease_seconds < 10 OR p_lease_seconds > 300 THEN
    RAISE EXCEPTION 'Lease duration must be between 10 and 300 seconds' USING ERRCODE = '22023';
  END IF;
  IF p_max_connection_leases < 1 OR p_max_connection_leases > 20
    OR p_max_site_leases < 1 OR p_max_site_leases > 100
    OR p_max_connection_leases > p_max_site_leases THEN
    RAISE EXCEPTION 'Invalid worker concurrency limits' USING ERRCODE = '22023';
  END IF;

  -- A worker that dies on its final allowed attempt must not leave an item in
  -- processing forever. Recover those leases before looking for new work.
  FOR v_exhausted_job_id IN
    WITH exhausted AS (
      UPDATE public.background_job_items item_row
      SET
        status = 'failed',
        completed_at = v_now,
        error_message = 'Worker lease expired after the maximum number of attempts.',
        last_error_code = 'lease_attempts_exhausted',
        lease_owner = NULL,
        leased_until = NULL,
        heartbeat_at = v_now,
        updated_at = v_now
      FROM public.background_jobs job_row
      JOIN public.moodle_sync_job_context context_row
        ON context_row.job_id = job_row.id
       AND context_row.schema_version = 2
      WHERE item_row.job_id = job_row.id
        AND job_row.job_type = 'moodle_sync'
        AND job_row.source = 'sync'
        AND job_row.status = 'processing'
        AND (p_job_id IS NULL OR job_row.id = p_job_id)
        AND item_row.status = 'processing'
        AND item_row.leased_until <= v_now
        AND item_row.attempt_count >= item_row.max_attempts
      RETURNING item_row.job_id
    )
    SELECT DISTINCT exhausted.job_id FROM exhausted
  LOOP
    PERFORM public.backend_finalize_moodle_sync_job(v_exhausted_job_id);
  END LOOP;

  RETURN QUERY
  WITH candidate AS MATERIALIZED (
    SELECT
      item_row.id,
      job_row.id AS candidate_job_id,
      context_row.moodle_connection_id,
      connection_row.moodle_site_id
    FROM public.background_job_items item_row
    JOIN public.background_jobs job_row
      ON job_row.id = item_row.job_id
    JOIN public.moodle_sync_job_context context_row
      ON context_row.job_id = job_row.id
     AND context_row.schema_version = 2
    JOIN public.user_moodle_connections connection_row
      ON connection_row.id = context_row.moodle_connection_id
     AND connection_row.user_id = job_row.user_id
     AND connection_row.status IN ('active', 'reauth_required')
    JOIN public.moodle_sites site_row
      ON site_row.id = connection_row.moodle_site_id
     AND site_row.status = 'approved'
    WHERE job_row.job_type = 'moodle_sync'
      AND job_row.source = 'sync'
      AND job_row.status IN ('pending', 'processing')
      AND (p_job_id IS NULL OR job_row.id = p_job_id)
      AND item_row.available_at <= v_now
      AND item_row.attempt_count < item_row.max_attempts
      AND (
        item_row.status = 'pending'
        OR (
          item_row.status = 'processing'
          AND item_row.leased_until IS NOT NULL
          AND item_row.leased_until <= v_now
        )
      )
      AND (
        split_part(COALESCE(item_row.item_key, ''), ':', 1) NOT IN ('students', 'activities', 'grades')
        OR EXISTS (
          SELECT 1
          FROM public.courses course_row
          WHERE course_row.id::TEXT = item_row.metadata ->> 'course_id'
            AND course_row.moodle_site_id = connection_row.moodle_site_id
        )
      )
      AND (
        split_part(COALESCE(item_row.item_key, ''), ':', 1) <> 'students'
        OR NOT EXISTS (
          SELECT 1
          FROM public.background_job_items prerequisite
          WHERE prerequisite.job_id = job_row.id
            AND prerequisite.item_key = 'courses'
            AND prerequisite.status <> 'completed'
        )
      )
      AND (
        split_part(COALESCE(item_row.item_key, ''), ':', 1) NOT IN ('activities', 'grades')
        OR NOT EXISTS (
          SELECT 1
          FROM public.background_job_items prerequisite
          WHERE prerequisite.job_id = job_row.id
            AND prerequisite.item_key = 'students:' || (item_row.metadata ->> 'course_id')
            AND prerequisite.status <> 'completed'
        )
      )
      AND (
        item_row.item_key <> 'risk'
        OR NOT EXISTS (
          SELECT 1
          FROM public.background_job_items prerequisite
          WHERE prerequisite.job_id = job_row.id
            AND prerequisite.item_key LIKE 'students:%'
            AND prerequisite.status <> 'completed'
        )
      )
      AND (
        SELECT count(*)
        FROM public.background_job_items active_item
        JOIN public.moodle_sync_job_context active_context
          ON active_context.job_id = active_item.job_id
        WHERE active_context.moodle_connection_id = context_row.moodle_connection_id
          AND active_item.status = 'processing'
          AND active_item.leased_until > v_now
      ) < p_max_connection_leases
      AND (
        SELECT count(*)
        FROM public.background_job_items active_item
        JOIN public.moodle_sync_job_context active_context
          ON active_context.job_id = active_item.job_id
        JOIN public.user_moodle_connections active_connection
          ON active_connection.id = active_context.moodle_connection_id
        WHERE active_connection.moodle_site_id = connection_row.moodle_site_id
          AND active_item.status = 'processing'
          AND active_item.leased_until > v_now
      ) < p_max_site_leases
    ORDER BY item_row.available_at, item_row.created_at, item_row.id
    FOR UPDATE OF item_row, connection_row, site_row SKIP LOCKED
    LIMIT 1
  ),
  activated_job AS (
    UPDATE public.background_jobs job_row
    SET
      status = 'processing',
      started_at = COALESCE(job_row.started_at, v_now),
      completed_at = NULL,
      updated_at = v_now
    FROM candidate
    WHERE job_row.id = candidate.candidate_job_id
      AND job_row.status IN ('pending', 'processing')
    RETURNING job_row.id
  ),
  claimed AS (
    UPDATE public.background_job_items item_row
    SET
      status = 'processing',
      lease_owner = btrim(p_worker_id),
      leased_until = v_now + make_interval(secs => p_lease_seconds),
      heartbeat_at = v_now,
      attempt_count = item_row.attempt_count + 1,
      started_at = COALESCE(item_row.started_at, v_now),
      completed_at = NULL,
      updated_at = v_now
    FROM candidate
    JOIN activated_job ON activated_job.id = candidate.candidate_job_id
    WHERE item_row.id = candidate.id
    RETURNING item_row.*
  )
  SELECT
    claimed.id,
    claimed.job_id,
    claimed.user_id,
    claimed.item_key,
    claimed.label,
    claimed.metadata,
    claimed.cursor,
    claimed.attempt_count,
    claimed.max_attempts,
    claimed.leased_until,
    job_row.metadata,
    context_row.moodle_connection_id,
    connection_row.moodle_site_id,
    context_row.sync_policy
  FROM claimed
  JOIN public.background_jobs job_row ON job_row.id = claimed.job_id
  JOIN public.moodle_sync_job_context context_row ON context_row.job_id = claimed.job_id
  JOIN public.user_moodle_connections connection_row ON connection_row.id = context_row.moodle_connection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_heartbeat_moodle_sync_item(
  p_item_id UUID,
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 60,
  p_cursor JSONB DEFAULT NULL,
  p_progress_current INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_lease_seconds < 10 OR p_lease_seconds > 300 OR p_progress_current < 0 THEN
    RAISE EXCEPTION 'Invalid heartbeat parameters' USING ERRCODE = '22023';
  END IF;

  UPDATE public.background_job_items item_row
  SET
    heartbeat_at = v_now,
    leased_until = v_now + make_interval(secs => p_lease_seconds),
    cursor = COALESCE(p_cursor, item_row.cursor),
    progress_current = COALESCE(p_progress_current, item_row.progress_current),
    updated_at = v_now
  FROM public.background_jobs job_row
  WHERE item_row.id = p_item_id
    AND item_row.job_id = job_row.id
    AND item_row.status = 'processing'
    AND item_row.lease_owner = p_worker_id
    AND item_row.leased_until > v_now
    AND job_row.status = 'processing';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_checkpoint_moodle_sync_item(
  p_item_id UUID,
  p_worker_id TEXT,
  p_cursor JSONB,
  p_progress_current INTEGER DEFAULT NULL,
  p_resume_after_seconds INTEGER DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_cursor IS NULL OR p_resume_after_seconds < 0 OR p_resume_after_seconds > 3600
    OR p_progress_current < 0 THEN
    RAISE EXCEPTION 'Invalid checkpoint parameters' USING ERRCODE = '22023';
  END IF;

  UPDATE public.background_job_items item_row
  SET
    status = 'pending',
    available_at = v_now + make_interval(secs => p_resume_after_seconds),
    lease_owner = NULL,
    leased_until = NULL,
    heartbeat_at = v_now,
    cursor = p_cursor,
    progress_current = COALESCE(p_progress_current, item_row.progress_current),
    attempt_count = greatest(item_row.attempt_count - 1, 0),
    updated_at = v_now
  FROM public.background_jobs job_row
  WHERE item_row.id = p_item_id
    AND item_row.job_id = job_row.id
    AND item_row.status = 'processing'
    AND item_row.lease_owner = p_worker_id
    AND item_row.leased_until > v_now
    AND job_row.status = 'processing';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_complete_moodle_sync_item(
  p_item_id UUID,
  p_worker_id TEXT,
  p_cursor JSONB DEFAULT NULL,
  p_progress_current INTEGER DEFAULT NULL,
  p_result_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job_id UUID;
  v_item_key TEXT;
  v_item_metadata JSONB;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_progress_current < 0 OR jsonb_typeof(COALESCE(p_result_metadata, '{}'::JSONB)) <> 'object' THEN
    RAISE EXCEPTION 'Invalid completion parameters' USING ERRCODE = '22023';
  END IF;

  UPDATE public.background_job_items item_row
  SET
    status = 'completed',
    completed_at = v_now,
    error_message = NULL,
    last_error_code = NULL,
    lease_owner = NULL,
    leased_until = NULL,
    heartbeat_at = v_now,
    cursor = COALESCE(p_cursor, item_row.cursor),
    progress_current = COALESCE(p_progress_current, item_row.progress_total),
    metadata = item_row.metadata || COALESCE(p_result_metadata, '{}'::JSONB),
    updated_at = v_now
  FROM public.background_jobs job_row
  WHERE item_row.id = p_item_id
    AND item_row.job_id = job_row.id
    AND item_row.status = 'processing'
    AND item_row.lease_owner = p_worker_id
    AND item_row.leased_until > v_now
    AND job_row.status = 'processing'
  RETURNING item_row.job_id, item_row.item_key, item_row.metadata
  INTO v_job_id, v_item_key, v_item_metadata;

  IF v_job_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Advance the durable watermark only in the same transaction that commits a
  -- successful item. Delta skipping remains disabled until shadow comparison
  -- proves it safe, but the checkpoint is already trustworthy.
  IF split_part(COALESCE(v_item_key, ''), ':', 1) IN ('students', 'activities', 'grades') THEN
    INSERT INTO public.moodle_sync_watermarks (
      moodle_connection_id,
      course_id,
      entity,
      last_successful_sync_at,
      source_release
    )
    SELECT
      context_row.moodle_connection_id,
      course_row.id,
      split_part(v_item_key, ':', 1),
      v_now,
      site_row.release
    FROM public.moodle_sync_job_context context_row
    JOIN public.user_moodle_connections connection_row
      ON connection_row.id = context_row.moodle_connection_id
    JOIN public.moodle_sites site_row
      ON site_row.id = connection_row.moodle_site_id
    JOIN public.courses course_row
      ON course_row.id::TEXT = v_item_metadata ->> 'course_id'
     AND course_row.moodle_site_id = connection_row.moodle_site_id
    WHERE context_row.job_id = v_job_id
      AND context_row.schema_version = 2
    ON CONFLICT (moodle_connection_id, course_id, entity) DO UPDATE
    SET
      last_successful_sync_at = EXCLUDED.last_successful_sync_at,
      source_release = EXCLUDED.source_release,
      updated_at = EXCLUDED.last_successful_sync_at;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Completed Moodle item has invalid connection/course scope';
    END IF;
  END IF;

  RETURN public.backend_finalize_moodle_sync_job(v_job_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_fail_moodle_sync_item(
  p_item_id UUID,
  p_worker_id TEXT,
  p_error_code TEXT,
  p_error_message TEXT,
  p_retryable BOOLEAN DEFAULT FALSE,
  p_retry_after_seconds INTEGER DEFAULT 30,
  p_cursor JSONB DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job_id UUID;
  v_status public.background_job_item_status;
  v_item_key TEXT;
  v_item_metadata JSONB;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_error_code IS NULL OR btrim(p_error_code) = ''
    OR p_retry_after_seconds < 0 OR p_retry_after_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid failure parameters' USING ERRCODE = '22023';
  END IF;

  UPDATE public.background_job_items item_row
  SET
    status = CASE
      WHEN p_retryable AND item_row.attempt_count < item_row.max_attempts
        THEN 'pending'::public.background_job_item_status
      ELSE 'failed'::public.background_job_item_status
    END,
    available_at = CASE
      WHEN p_retryable AND item_row.attempt_count < item_row.max_attempts
        THEN v_now + make_interval(secs => p_retry_after_seconds)
      ELSE item_row.available_at
    END,
    completed_at = CASE
      WHEN p_retryable AND item_row.attempt_count < item_row.max_attempts THEN NULL
      ELSE v_now
    END,
    error_message = left(COALESCE(NULLIF(btrim(p_error_message), ''), 'Moodle sync item failed.'), 1000),
    last_error_code = left(btrim(p_error_code), 120),
    lease_owner = NULL,
    leased_until = NULL,
    heartbeat_at = v_now,
    cursor = COALESCE(p_cursor, item_row.cursor),
    updated_at = v_now
  FROM public.background_jobs job_row
  WHERE item_row.id = p_item_id
    AND item_row.job_id = job_row.id
    AND item_row.status = 'processing'
    AND item_row.lease_owner = p_worker_id
    AND item_row.leased_until > v_now
    AND job_row.status = 'processing'
  RETURNING item_row.job_id, item_row.status, item_row.item_key, item_row.metadata
  INTO v_job_id, v_status, v_item_key, v_item_metadata;

  IF v_job_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_status = 'pending' THEN
    PERFORM public.backend_finalize_moodle_sync_job(v_job_id);
    RETURN 'retry_scheduled';
  END IF;

  -- Do not strand dependent work in pending after a terminal prerequisite
  -- failure. A manual retry resets these cancelled-by-dependency items too.
  IF split_part(COALESCE(v_item_key, ''), ':', 1) = 'students' THEN
    UPDATE public.background_job_items dependent_item
    SET
      status = 'failed',
      completed_at = v_now,
      error_message = 'Prerequisite student synchronization failed.',
      last_error_code = 'dependency_failed',
      updated_at = v_now
    WHERE dependent_item.job_id = v_job_id
      AND dependent_item.status = 'pending'
      AND (
        dependent_item.item_key IN (
          'activities:' || (v_item_metadata ->> 'course_id'),
          'grades:' || (v_item_metadata ->> 'course_id')
        )
        OR dependent_item.item_key = 'risk'
      );
  ELSIF v_item_key = 'courses' THEN
    UPDATE public.background_job_items dependent_item
    SET
      status = 'failed',
      completed_at = v_now,
      error_message = 'Prerequisite course synchronization failed.',
      last_error_code = 'dependency_failed',
      updated_at = v_now
    WHERE dependent_item.job_id = v_job_id
      AND dependent_item.status = 'pending';
  END IF;

  RETURN public.backend_finalize_moodle_sync_job(v_job_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_cancel_moodle_sync_job(
  p_job_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  UPDATE public.background_jobs job_row
  SET
    status = 'cancelled',
    completed_at = v_now,
    error_message = NULL,
    updated_at = v_now
  WHERE job_row.id = p_job_id
    AND job_row.user_id = p_user_id
    AND job_row.job_type = 'moodle_sync'
    AND job_row.source = 'sync'
    AND job_row.status IN ('pending', 'processing');

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.background_job_items
  SET
    status = 'cancelled',
    completed_at = v_now,
    lease_owner = NULL,
    leased_until = NULL,
    heartbeat_at = v_now,
    updated_at = v_now
  WHERE job_id = p_job_id
    AND status IN ('pending', 'processing');

  UPDATE public.background_jobs job_row
  SET
    processed_items = counts.processed_count,
    success_count = counts.success_count,
    error_count = counts.error_count
  FROM (
    SELECT
      count(*) FILTER (WHERE status IN ('completed', 'failed', 'cancelled')) AS processed_count,
      count(*) FILTER (WHERE status = 'completed') AS success_count,
      count(*) FILTER (WHERE status = 'failed') AS error_count
    FROM public.background_job_items
    WHERE job_id = p_job_id
  ) counts
  WHERE job_row.id = p_job_id;

  INSERT INTO public.background_job_events (
    job_id, user_id, event_type, level, message, metadata
  ) VALUES (
    p_job_id,
    p_user_id,
    'job_cancelled',
    'warning',
    'Sincronizacao Moodle cancelada.',
    jsonb_build_object('schema_version', 2)
  )
  ON CONFLICT (job_id) WHERE event_type IN ('job_completed', 'job_failed', 'job_cancelled')
  DO NOTHING;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_retry_moodle_sync_job(
  p_job_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  PERFORM 1
  FROM public.background_jobs job_row
  JOIN public.moodle_sync_job_context context_row
    ON context_row.job_id = job_row.id
   AND context_row.schema_version = 2
  WHERE job_row.id = p_job_id
    AND job_row.user_id = p_user_id
    AND job_row.job_type = 'moodle_sync'
    AND job_row.source = 'sync'
    AND job_row.status IN ('failed', 'cancelled')
  FOR UPDATE OF job_row;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.background_job_events
  SET event_type = 'job_terminal_superseded'
  WHERE job_id = p_job_id
    AND event_type IN ('job_completed', 'job_failed', 'job_cancelled');

  UPDATE public.background_job_items
  SET
    status = 'pending',
    available_at = v_now,
    lease_owner = NULL,
    leased_until = NULL,
    heartbeat_at = NULL,
    attempt_count = 0,
    completed_at = NULL,
    error_message = NULL,
    last_error_code = NULL,
    updated_at = v_now
  WHERE job_id = p_job_id
    AND status IN ('failed', 'cancelled');

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.background_jobs
  SET
    status = 'pending',
    processed_items = (
      SELECT count(*) FROM public.background_job_items
      WHERE job_id = p_job_id AND status = 'completed'
    ),
    success_count = (
      SELECT count(*) FROM public.background_job_items
      WHERE job_id = p_job_id AND status = 'completed'
    ),
    error_count = 0,
    started_at = NULL,
    completed_at = NULL,
    error_message = NULL,
    updated_at = v_now
  WHERE id = p_job_id;

  INSERT INTO public.background_job_events (
    job_id, user_id, event_type, level, message, metadata
  ) VALUES (
    p_job_id,
    p_user_id,
    'job_retry_scheduled',
    'info',
    'Nova tentativa da sincronizacao Moodle agendada.',
    jsonb_build_object('schema_version', 2)
  );

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_create_moodle_sync_job_v2(
  p_user_id UUID,
  p_moodle_connection_id UUID,
  p_source_record_id UUID,
  p_sync_kind TEXT,
  p_course_ids UUID[],
  p_entities TEXT[],
  p_trigger TEXT,
  p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job_id UUID := gen_random_uuid();
  v_site_id UUID;
  v_expected_keys TEXT[];
  v_received_keys TEXT[];
BEGIN
  IF p_sync_kind NOT IN ('initial', 'incremental')
    OR p_trigger NOT IN ('initial', 'scheduler', 'stale_read', 'manual', 'reconciliation') THEN
    RAISE EXCEPTION 'Invalid Moodle sync job kind or trigger' USING ERRCODE = '22023';
  END IF;
  IF cardinality(p_course_ids) < 1 OR cardinality(p_course_ids) > 200
    OR cardinality(p_entities) < 1 OR cardinality(p_entities) > 3
    OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid Moodle sync job dimensions' USING ERRCODE = '22023';
  END IF;
  IF cardinality(p_course_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(p_course_ids)))
    OR cardinality(p_entities) <> cardinality(ARRAY(SELECT DISTINCT unnest(p_entities)))
    OR EXISTS (
      SELECT 1 FROM unnest(p_entities) entity_row
      WHERE entity_row NOT IN ('students', 'activities', 'grades')
    ) THEN
    RAISE EXCEPTION 'Moodle sync courses and entities must be unique and valid' USING ERRCODE = '22023';
  END IF;

  SELECT connection_row.moodle_site_id
  INTO v_site_id
  FROM public.user_moodle_connections connection_row
  JOIN public.moodle_sites site_row
    ON site_row.id = connection_row.moodle_site_id
   AND site_row.status = 'approved'
  WHERE connection_row.id = p_moodle_connection_id
    AND connection_row.user_id = p_user_id
    AND connection_row.status IN ('active', 'reauth_required')
  FOR UPDATE OF connection_row;

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'Moodle connection not found' USING ERRCODE = '42501';
  END IF;
  IF (
    SELECT count(*) FROM public.courses course_row
    WHERE course_row.id = ANY(p_course_ids)
      AND course_row.moodle_site_id = v_site_id
  ) <> cardinality(p_course_ids) THEN
    RAISE EXCEPTION 'Moodle sync course is outside the connection site' USING ERRCODE = '42501';
  END IF;

  IF p_sync_kind = 'initial' AND EXISTS (
    SELECT 1 FROM unnest(p_course_ids) selected_course(course_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_course_catalog_eligibility eligibility_row
      WHERE eligibility_row.user_id = p_user_id
        AND eligibility_row.moodle_connection_id = p_moodle_connection_id
        AND eligibility_row.course_id = selected_course.course_id
    )
  ) THEN
    RAISE EXCEPTION 'Moodle sync course is outside initial eligibility' USING ERRCODE = '42501';
  ELSIF p_sync_kind = 'incremental' AND EXISTS (
    SELECT 1 FROM unnest(p_course_ids) selected_course(course_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_courses user_course_row
      WHERE user_course_row.user_id = p_user_id
        AND user_course_row.course_id = selected_course.course_id
    )
  ) THEN
    RAISE EXCEPTION 'Moodle sync course is outside the user scope' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(item_key ORDER BY item_key)
  INTO v_expected_keys
  FROM (
    SELECT entity_row || ':' || course_id::TEXT AS item_key
    FROM unnest(p_entities) entity_row
    CROSS JOIN unnest(p_course_ids) course_id
    UNION ALL
    SELECT 'risk' WHERE 'students' = ANY(p_entities)
  ) expected;

  SELECT array_agg(item_row ->> 'item_key' ORDER BY item_row ->> 'item_key')
  INTO v_received_keys
  FROM jsonb_array_elements(p_items) item_row
  WHERE jsonb_typeof(item_row) = 'object'
    AND jsonb_typeof(item_row -> 'metadata') = 'object'
    AND length(COALESCE(item_row ->> 'label', '')) BETWEEN 1 AND 240
    AND (
      (
        item_row ->> 'item_key' = 'risk'
        AND item_row -> 'metadata' ->> 'entity' = 'risk'
      )
      OR (
        split_part(item_row ->> 'item_key', ':', 1) = ANY(p_entities)
        AND item_row -> 'metadata' ->> 'entity' = split_part(item_row ->> 'item_key', ':', 1)
        AND item_row -> 'metadata' ->> 'course_id' = split_part(item_row ->> 'item_key', ':', 2)
        AND split_part(item_row ->> 'item_key', ':', 2) = ANY(
          ARRAY(SELECT course_id::TEXT FROM unnest(p_course_ids) course_id)
        )
      )
    );

  IF v_received_keys IS DISTINCT FROM v_expected_keys THEN
    RAISE EXCEPTION 'Moodle sync work items do not match the requested plan' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.background_jobs (
    id,
    user_id,
    course_id,
    job_type,
    source,
    source_table,
    source_record_id,
    title,
    description,
    status,
    total_items,
    metadata
  ) VALUES (
    v_job_id,
    p_user_id,
    CASE WHEN cardinality(p_course_ids) = 1 THEN p_course_ids[1] ELSE NULL END,
    'moodle_sync',
    'sync',
    'moodle_sync_request',
    p_source_record_id,
    CASE
      WHEN p_sync_kind = 'initial' THEN 'Sincronizacao inicial do Moodle'
      ELSE 'Atualizacao de unidade curricular'
    END,
    format('%s curso(s) em processamento pelo servidor.', cardinality(p_course_ids)),
    'pending',
    jsonb_array_length(p_items),
    jsonb_build_object(
      'connection_id', p_moodle_connection_id,
      'course_ids', to_jsonb(p_course_ids),
      'entities', to_jsonb(p_entities),
      'schema_version', 2,
      'sync_kind', p_sync_kind,
      'trigger', p_trigger
    )
  );

  INSERT INTO public.moodle_sync_job_context (
    job_id, moodle_connection_id, schema_version, sync_policy
  ) VALUES (
    v_job_id,
    p_moodle_connection_id,
    2,
    jsonb_build_object('trigger', p_trigger)
  );

  INSERT INTO public.background_job_items (
    job_id,
    user_id,
    item_key,
    label,
    status,
    progress_current,
    progress_total,
    metadata,
    available_at
  )
  SELECT
    v_job_id,
    p_user_id,
    item_row ->> 'item_key',
    item_row ->> 'label',
    'pending',
    0,
    1,
    item_row -> 'metadata',
    clock_timestamp()
  FROM jsonb_array_elements(p_items) item_row;

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.backend_finalize_moodle_sync_job(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backend_claim_moodle_sync_item(TEXT, UUID, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backend_heartbeat_moodle_sync_item(UUID, TEXT, INTEGER, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backend_checkpoint_moodle_sync_item(UUID, TEXT, JSONB, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backend_complete_moodle_sync_item(UUID, TEXT, JSONB, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backend_fail_moodle_sync_item(UUID, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backend_cancel_moodle_sync_job(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backend_retry_moodle_sync_job(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backend_create_moodle_sync_job_v2(UUID, UUID, UUID, TEXT, UUID[], TEXT[], TEXT, JSONB) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.backend_finalize_moodle_sync_job(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_claim_moodle_sync_item(TEXT, UUID, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_heartbeat_moodle_sync_item(UUID, TEXT, INTEGER, JSONB, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_checkpoint_moodle_sync_item(UUID, TEXT, JSONB, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_complete_moodle_sync_item(UUID, TEXT, JSONB, INTEGER, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_fail_moodle_sync_item(UUID, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_cancel_moodle_sync_job(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_retry_moodle_sync_job(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_create_moodle_sync_job_v2(UUID, UUID, UUID, TEXT, UUID[], TEXT[], TEXT, JSONB) TO service_role;

COMMENT ON FUNCTION public.backend_claim_moodle_sync_item(TEXT, UUID, INTEGER, INTEGER, INTEGER) IS
  'Atomically claims one schema-v2 Moodle work item with SKIP LOCKED and connection/site backpressure.';
COMMENT ON FUNCTION public.backend_checkpoint_moodle_sync_item(UUID, TEXT, JSONB, INTEGER, INTEGER) IS
  'Persists a resumable cursor and releases the lease without consuming a retry attempt.';
COMMENT ON FUNCTION public.backend_finalize_moodle_sync_job(UUID) IS
  'Atomically derives Moodle job counters and terminal state from its durable items.';
