-- Bounded transport counters projected from the durable item metadata. The
-- response-byte counter is the size of the JSON response processed by the
-- application, not wire-transfer bytes. The worker may persist only
-- the numeric counters below; this projection never returns an item payload,
-- request URL, credential, or Moodle identity.
--
-- Per-item values are clamped defensively so a malformed metadata value cannot
-- make an operational aggregate unbounded.  The values are intentionally
-- aggregates per site/Claris connection, never a request-by-request trace.

DROP FUNCTION IF EXISTS public.backend_get_moodle_sync_operational_metrics(INTEGER, INTEGER);

CREATE FUNCTION public.backend_get_moodle_sync_operational_metrics(
  p_window_hours INTEGER DEFAULT 168,
  p_stuck_after_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  site_slug TEXT,
  moodle_connection_id UUID,
  window_started_at TIMESTAMPTZ,
  window_ended_at TIMESTAMPTZ,
  jobs_started INTEGER,
  jobs_completed INTEGER,
  jobs_failed INTEGER,
  active_jobs INTEGER,
  completed_items INTEGER,
  failed_items INTEGER,
  retry_attempts INTEGER,
  stuck_items INTEGER,
  oldest_stuck_at TIMESTAMPTZ,
  avg_job_duration_ms BIGINT,
  p95_job_duration_ms BIGINT,
  avg_item_duration_ms BIGINT,
  p95_item_duration_ms BIGINT,
  moodle_api_calls BIGINT,
  moodle_response_bytes BIGINT,
  circuit_state TEXT,
  circuit_open_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_window_started_at TIMESTAMPTZ;
  v_stuck_before TIMESTAMPTZ;
BEGIN
  IF p_window_hours < 1 OR p_window_hours > 24 * 90 THEN
    RAISE EXCEPTION 'Moodle observability window must be between 1 hour and 90 days'
      USING ERRCODE = '22023';
  END IF;
  IF p_stuck_after_seconds < 60 OR p_stuck_after_seconds > 3600 THEN
    RAISE EXCEPTION 'Moodle stuck threshold must be between 60 and 3600 seconds'
      USING ERRCODE = '22023';
  END IF;

  v_window_started_at := v_now - make_interval(hours => p_window_hours);
  v_stuck_before := v_now - make_interval(secs => p_stuck_after_seconds);

  RETURN QUERY
  WITH scope AS MATERIALIZED (
    SELECT DISTINCT
      connection_row.moodle_site_id,
      site_row.slug AS site_slug,
      context_row.moodle_connection_id
    FROM public.moodle_sync_job_context context_row
    JOIN public.background_jobs job_row
      ON job_row.id = context_row.job_id
    JOIN public.user_moodle_connections connection_row
      ON connection_row.id = context_row.moodle_connection_id
    JOIN public.moodle_sites site_row
      ON site_row.id = connection_row.moodle_site_id
    WHERE context_row.schema_version = 2
      AND job_row.job_type = 'moodle_sync'
      AND job_row.source = 'sync'
      AND (
        job_row.created_at >= v_window_started_at
        OR job_row.status IN ('pending', 'processing')
      )
  ),
  job_metrics AS (
    SELECT
      context_row.moodle_connection_id,
      count(*) FILTER (
        WHERE job_row.started_at >= v_window_started_at
      )::INTEGER AS jobs_started,
      count(*) FILTER (
        WHERE job_row.status = 'completed'
          AND job_row.completed_at >= v_window_started_at
      )::INTEGER AS jobs_completed,
      count(*) FILTER (
        WHERE job_row.status = 'failed'
          AND job_row.completed_at >= v_window_started_at
      )::INTEGER AS jobs_failed,
      count(*) FILTER (
        WHERE job_row.status IN ('pending', 'processing')
      )::INTEGER AS active_jobs,
      COALESCE(round(avg(extract(epoch FROM (job_row.completed_at - job_row.started_at)) * 1000)
        FILTER (
          WHERE job_row.completed_at >= v_window_started_at
            AND job_row.started_at IS NOT NULL
            AND job_row.completed_at IS NOT NULL
        )), 0)::BIGINT AS avg_job_duration_ms,
      COALESCE(round(percentile_cont(0.95) WITHIN GROUP (
        ORDER BY extract(epoch FROM (job_row.completed_at - job_row.started_at)) * 1000
      ) FILTER (
        WHERE job_row.completed_at >= v_window_started_at
          AND job_row.started_at IS NOT NULL
          AND job_row.completed_at IS NOT NULL
      )), 0)::BIGINT AS p95_job_duration_ms
    FROM public.background_jobs job_row
    JOIN public.moodle_sync_job_context context_row
      ON context_row.job_id = job_row.id
     AND context_row.schema_version = 2
    JOIN scope scope_row
      ON scope_row.moodle_connection_id = context_row.moodle_connection_id
    WHERE job_row.job_type = 'moodle_sync'
      AND job_row.source = 'sync'
      AND (
        job_row.completed_at >= v_window_started_at
        OR job_row.status IN ('pending', 'processing')
      )
    GROUP BY context_row.moodle_connection_id
  ),
  item_metrics AS (
    SELECT
      context_row.moodle_connection_id,
      count(*) FILTER (
        WHERE item_row.status = 'completed'
          AND item_row.completed_at >= v_window_started_at
      )::INTEGER AS completed_items,
      count(*) FILTER (
        WHERE item_row.status = 'failed'
          AND item_row.completed_at >= v_window_started_at
      )::INTEGER AS failed_items,
      COALESCE(sum(greatest(item_row.attempt_count - 1, 0)) FILTER (
        WHERE item_row.completed_at >= v_window_started_at
          OR item_row.status IN ('pending', 'processing')
      ), 0)::INTEGER AS retry_attempts,
      count(*) FILTER (
        WHERE item_row.status = 'processing'
          AND (
            item_row.leased_until <= v_now
            OR coalesce(item_row.heartbeat_at, item_row.started_at, item_row.updated_at) <= v_stuck_before
          )
      )::INTEGER AS stuck_items,
      min(coalesce(item_row.heartbeat_at, item_row.started_at, item_row.updated_at)) FILTER (
        WHERE item_row.status = 'processing'
          AND (
            item_row.leased_until <= v_now
            OR coalesce(item_row.heartbeat_at, item_row.started_at, item_row.updated_at) <= v_stuck_before
          )
      ) AS oldest_stuck_at,
      COALESCE(round(avg(extract(epoch FROM (item_row.completed_at - item_row.started_at)) * 1000)
        FILTER (
          WHERE item_row.completed_at >= v_window_started_at
            AND item_row.started_at IS NOT NULL
            AND item_row.completed_at IS NOT NULL
        )), 0)::BIGINT AS avg_item_duration_ms,
      COALESCE(round(percentile_cont(0.95) WITHIN GROUP (
        ORDER BY extract(epoch FROM (item_row.completed_at - item_row.started_at)) * 1000
      ) FILTER (
        WHERE item_row.completed_at >= v_window_started_at
          AND item_row.started_at IS NOT NULL
          AND item_row.completed_at IS NOT NULL
      )), 0)::BIGINT AS p95_item_duration_ms
    FROM public.background_job_items item_row
    JOIN public.background_jobs job_row
      ON job_row.id = item_row.job_id
    JOIN public.moodle_sync_job_context context_row
      ON context_row.job_id = job_row.id
     AND context_row.schema_version = 2
    JOIN scope scope_row
      ON scope_row.moodle_connection_id = context_row.moodle_connection_id
    WHERE job_row.job_type = 'moodle_sync'
      AND job_row.source = 'sync'
      AND (
        item_row.completed_at >= v_window_started_at
        OR item_row.status IN ('pending', 'processing')
      )
    GROUP BY context_row.moodle_connection_id
  ),
  transport_metrics AS (
    SELECT
      context_row.moodle_connection_id,
      COALESCE(sum(
        CASE
          WHEN COALESCE(item_row.metadata ->> 'moodle_api_calls', item_row.metadata ->> 'api_calls')
            ~ '^[0-9]{1,5}$'
          THEN least(
            COALESCE(item_row.metadata ->> 'moodle_api_calls', item_row.metadata ->> 'api_calls')::BIGINT,
            100000::BIGINT
          )
          ELSE 0
        END
      ), 0)::BIGINT AS moodle_api_calls,
      COALESCE(sum(
        CASE
          WHEN COALESCE(item_row.metadata ->> 'moodle_response_bytes', item_row.metadata ->> 'response_bytes')
            ~ '^[0-9]{1,8}$'
          THEN least(
            COALESCE(item_row.metadata ->> 'moodle_response_bytes', item_row.metadata ->> 'response_bytes')::BIGINT,
            16777216::BIGINT
          )
          ELSE 0
        END
      ), 0)::BIGINT AS moodle_response_bytes
    FROM public.background_job_items item_row
    JOIN public.background_jobs job_row
      ON job_row.id = item_row.job_id
    JOIN public.moodle_sync_job_context context_row
      ON context_row.job_id = job_row.id
     AND context_row.schema_version = 2
    JOIN scope scope_row
      ON scope_row.moodle_connection_id = context_row.moodle_connection_id
    WHERE job_row.job_type = 'moodle_sync'
      AND job_row.source = 'sync'
      AND item_row.status = 'completed'
      AND item_row.completed_at >= v_window_started_at
      AND split_part(COALESCE(item_row.item_key, ''), ':', 1) IN ('students', 'activities', 'grades')
    GROUP BY context_row.moodle_connection_id
  )
  SELECT
    scope_row.site_slug,
    scope_row.moodle_connection_id,
    v_window_started_at,
    v_now,
    COALESCE(job_metrics.jobs_started, 0),
    COALESCE(job_metrics.jobs_completed, 0),
    COALESCE(job_metrics.jobs_failed, 0),
    COALESCE(job_metrics.active_jobs, 0),
    COALESCE(item_metrics.completed_items, 0),
    COALESCE(item_metrics.failed_items, 0),
    COALESCE(item_metrics.retry_attempts, 0),
    COALESCE(item_metrics.stuck_items, 0),
    item_metrics.oldest_stuck_at,
    COALESCE(job_metrics.avg_job_duration_ms, 0),
    COALESCE(job_metrics.p95_job_duration_ms, 0),
    COALESCE(item_metrics.avg_item_duration_ms, 0),
    COALESCE(item_metrics.p95_item_duration_ms, 0),
    COALESCE(transport_metrics.moodle_api_calls, 0),
    COALESCE(transport_metrics.moodle_response_bytes, 0),
    COALESCE(circuit_row.state, 'closed'),
    circuit_row.open_until
  FROM scope scope_row
  LEFT JOIN job_metrics
    ON job_metrics.moodle_connection_id = scope_row.moodle_connection_id
  LEFT JOIN item_metrics
    ON item_metrics.moodle_connection_id = scope_row.moodle_connection_id
  LEFT JOIN transport_metrics
    ON transport_metrics.moodle_connection_id = scope_row.moodle_connection_id
  LEFT JOIN public.moodle_site_circuit_breakers circuit_row
    ON circuit_row.moodle_site_id = scope_row.moodle_site_id
  ORDER BY scope_row.site_slug, scope_row.moodle_connection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.backend_get_moodle_sync_operational_metrics(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backend_get_moodle_sync_operational_metrics(INTEGER, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.backend_get_moodle_sync_operational_metrics(INTEGER, INTEGER) IS
  'Service-only sanitized operational aggregates per Moodle site and connection; includes bounded logical-call and processed-JSON response-size counters (not wire-transfer bytes), excludes credentials, Moodle identities, payloads, URLs and error text.';
