-- Durable, service-only dispatcher for Claris-first Moodle refreshes.
--
-- It only plans local background work. Moodle I/O stays exclusively in the
-- short-lived worker, which means this RPC is safe to call frequently from a
-- scheduler and safe to retry after a process restart.

CREATE OR REPLACE FUNCTION public.backend_dispatch_due_moodle_syncs(
  p_limit INTEGER DEFAULT 25
)
RETURNS TABLE (
  connection_id UUID,
  course_id UUID,
  job_id UUID,
  dispatch_status TEXT,
  trigger TEXT,
  next_incremental_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_state RECORD;
  v_policy RECORD;
  v_refresh RECORD;
  v_entities TEXT[];
  v_all_entities TEXT[];
  v_stale_entities TEXT[];
  v_watermark_at TIMESTAMPTZ;
  v_next_from_watermarks TIMESTAMPTZ;
  v_next_after_dispatch TIMESTAMPTZ;
  v_full_reconciliation BOOLEAN;
  v_trigger TEXT;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid_dispatch_limit' USING ERRCODE = '22023';
  END IF;

  -- A row lock plus SKIP LOCKED lets multiple scheduler replicas divide the
  -- due work. The underlying refresh RPC also has a canonical active-job
  -- constraint, giving us a second idempotency boundary.
  FOR v_state IN
    SELECT
      state_row.moodle_connection_id,
      state_row.course_id,
      state_row.temperature,
      state_row.last_full_sync_at,
      connection_row.user_id,
      connection_row.moodle_site_id
    FROM public.moodle_course_sync_state state_row
    JOIN public.user_moodle_connections connection_row
      ON connection_row.id = state_row.moodle_connection_id
     AND connection_row.status IN ('active', 'reauth_required')
    JOIN public.moodle_sites site_row
      ON site_row.id = connection_row.moodle_site_id
     AND site_row.status = 'approved'
    JOIN public.courses course_row
      ON course_row.id = state_row.course_id
     AND course_row.moodle_site_id = connection_row.moodle_site_id
    LEFT JOIN public.moodle_site_circuit_breakers circuit_row
      ON circuit_row.moodle_site_id = connection_row.moodle_site_id
    WHERE state_row.temperature <> 'archived'
      AND state_row.next_incremental_at IS NOT NULL
      AND state_row.next_incremental_at <= v_now
      AND public.backend_moodle_sync_rollout_enabled(
        connection_row.moodle_site_id,
        connection_row.user_id,
        'freshness'
      )
      AND NOT (
        circuit_row.state = 'open'
        AND circuit_row.open_until IS NOT NULL
        AND circuit_row.open_until > v_now
      )
    ORDER BY state_row.next_incremental_at, state_row.updated_at
    LIMIT p_limit
    FOR UPDATE OF state_row SKIP LOCKED
  LOOP
    BEGIN
      v_all_entities := ARRAY[]::TEXT[];
      v_stale_entities := ARRAY[]::TEXT[];
      v_next_from_watermarks := NULL;
      v_next_after_dispatch := NULL;
      v_full_reconciliation := FALSE;

      -- Resolve a site override before the global policy for every entity.
      -- The next state uses individual watermarks, so a hot grade course does
      -- not unnecessarily re-read activities and students on every cycle.
      FOR v_policy IN
        SELECT
          entity_row.entity,
          COALESCE(site_policy.stale_after_seconds, global_policy.stale_after_seconds) AS stale_after_seconds,
          COALESCE(site_policy.full_reconcile_after_seconds, global_policy.full_reconcile_after_seconds) AS full_reconcile_after_seconds
        FROM unnest(ARRAY['students', 'activities', 'grades']::TEXT[]) AS entity_row(entity)
        LEFT JOIN public.moodle_sync_policies site_policy
          ON site_policy.moodle_site_id = v_state.moodle_site_id
         AND site_policy.entity = entity_row.entity
         AND site_policy.temperature = v_state.temperature
        LEFT JOIN public.moodle_sync_policies global_policy
          ON global_policy.moodle_site_id IS NULL
         AND global_policy.entity = entity_row.entity
         AND global_policy.temperature = v_state.temperature
        WHERE COALESCE(site_policy.enabled, global_policy.enabled, FALSE)
      LOOP
        SELECT watermark_row.last_successful_sync_at
        INTO v_watermark_at
        FROM public.moodle_sync_watermarks watermark_row
        WHERE watermark_row.moodle_connection_id = v_state.moodle_connection_id
          AND watermark_row.course_id = v_state.course_id
          AND watermark_row.entity = v_policy.entity;

        v_all_entities := array_append(v_all_entities, v_policy.entity);
        v_next_after_dispatch := LEAST(
          COALESCE(v_next_after_dispatch, v_now + make_interval(secs => v_policy.stale_after_seconds)),
          v_now + make_interval(secs => v_policy.stale_after_seconds)
        );
        v_next_from_watermarks := LEAST(
          COALESCE(
            v_next_from_watermarks,
            COALESCE(v_watermark_at + make_interval(secs => v_policy.stale_after_seconds), v_now)
          ),
          COALESCE(v_watermark_at + make_interval(secs => v_policy.stale_after_seconds), v_now)
        );

        IF v_watermark_at IS NULL
          OR v_watermark_at + make_interval(secs => v_policy.stale_after_seconds) <= v_now
        THEN
          v_stale_entities := array_append(v_stale_entities, v_policy.entity);
        END IF;

        IF v_state.last_full_sync_at IS NULL
          OR v_state.last_full_sync_at + make_interval(secs => v_policy.full_reconcile_after_seconds) <= v_now
        THEN
          v_full_reconciliation := TRUE;
        END IF;
      END LOOP;

      IF cardinality(v_all_entities) = 0 THEN
        UPDATE public.moodle_course_sync_state AS state_row
        SET
          next_incremental_at = NULL,
          reason_codes = ARRAY['scheduler_no_enabled_policy'],
          last_error_codes = last_error_codes - 'dispatcher',
          updated_at = v_now
        WHERE state_row.moodle_connection_id = v_state.moodle_connection_id
          AND state_row.course_id = v_state.course_id;

        connection_id := v_state.moodle_connection_id;
        course_id := v_state.course_id;
        job_id := NULL;
        dispatch_status := 'disabled';
        trigger := 'scheduler';
        next_incremental_at := NULL;
        RETURN NEXT;
        CONTINUE;
      END IF;

      v_entities := CASE
        WHEN v_full_reconciliation THEN v_all_entities
        ELSE v_stale_entities
      END;

      IF cardinality(v_entities) = 0 THEN
        UPDATE public.moodle_course_sync_state AS state_row
        SET
          next_incremental_at = v_next_from_watermarks,
          reason_codes = ARRAY['scheduler_fresh'],
          last_error_codes = last_error_codes - 'dispatcher',
          updated_at = v_now
        WHERE state_row.moodle_connection_id = v_state.moodle_connection_id
          AND state_row.course_id = v_state.course_id;

        connection_id := v_state.moodle_connection_id;
        course_id := v_state.course_id;
        job_id := NULL;
        dispatch_status := 'fresh';
        trigger := 'scheduler';
        next_incremental_at := v_next_from_watermarks;
        RETURN NEXT;
        CONTINUE;
      END IF;

      v_trigger := CASE WHEN v_full_reconciliation THEN 'reconciliation' ELSE 'scheduler' END;
      SELECT *
      INTO v_refresh
      FROM public.backend_request_course_refresh_gated(
        v_state.user_id,
        v_state.moodle_connection_id,
        v_state.course_id,
        v_entities,
        v_trigger
      );

      IF v_refresh.refresh_status NOT IN ('queued', 'deduplicated') THEN
        RAISE EXCEPTION 'unexpected_refresh_status';
      END IF;

      -- Advance before the worker starts. A duplicate scheduler tick cannot
      -- keep issuing requests while the current job is pending/processing;
      -- terminal success recalculates this from the committed watermarks.
      UPDATE public.moodle_course_sync_state AS state_row
      SET
        next_incremental_at = v_next_after_dispatch,
        reason_codes = ARRAY['dispatch_' || v_trigger],
        last_error_codes = last_error_codes - 'dispatcher',
        updated_at = v_now
      WHERE state_row.moodle_connection_id = v_state.moodle_connection_id
        AND state_row.course_id = v_state.course_id;

      connection_id := v_state.moodle_connection_id;
      course_id := v_state.course_id;
      job_id := v_refresh.job_id;
      dispatch_status := v_refresh.refresh_status;
      trigger := v_trigger;
      next_incremental_at := v_next_after_dispatch;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      -- One malformed or temporarily unavailable connection must not prevent
      -- dispatching the next site. Do not expose provider/database details.
      UPDATE public.moodle_course_sync_state AS state_row
      SET
        next_incremental_at = v_now + INTERVAL '5 minutes',
        reason_codes = ARRAY['dispatcher_retry'],
        last_error_codes = COALESCE(last_error_codes, '{}'::JSONB)
          || jsonb_build_object('dispatcher', 'enqueue_failed'),
        updated_at = v_now
      WHERE state_row.moodle_connection_id = v_state.moodle_connection_id
        AND state_row.course_id = v_state.course_id;

      connection_id := v_state.moodle_connection_id;
      course_id := v_state.course_id;
      job_id := NULL;
      dispatch_status := 'retry_scheduled';
      trigger := 'scheduler';
      next_incremental_at := v_now + INTERVAL '5 minutes';
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_update_moodle_sync_state_on_terminal_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_connection_id UUID;
  v_site_id UUID;
  v_course RECORD;
  v_next_incremental_at TIMESTAMPTZ;
  v_trigger TEXT;
BEGIN
  IF NEW.status <> 'completed'
    OR NEW.job_type <> 'moodle_sync'
    OR NEW.source <> 'sync'
    OR COALESCE(NEW.metadata ->> 'schema_version', '') <> '2'
  THEN
    RETURN NEW;
  END IF;

  SELECT context_row.moodle_connection_id, connection_row.moodle_site_id
  INTO v_connection_id, v_site_id
  FROM public.moodle_sync_job_context context_row
  JOIN public.user_moodle_connections connection_row
    ON connection_row.id = context_row.moodle_connection_id
  WHERE context_row.job_id = NEW.id
    AND context_row.schema_version = 2;

  IF v_connection_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_trigger := COALESCE(NEW.metadata ->> 'trigger', 'scheduler');
  FOR v_course IN
    SELECT course_row.id
    FROM jsonb_array_elements_text(COALESCE(NEW.metadata -> 'course_ids', '[]'::JSONB)) AS requested_course(course_id)
    JOIN public.courses course_row
      ON course_row.id::TEXT = requested_course.course_id
     AND course_row.moodle_site_id = v_site_id
  LOOP
    -- Initial jobs may not have a pre-existing state. Reclassification is
    -- entirely Claris-local and determines the first schedule temperature.
    BEGIN
      PERFORM public.backend_reclassify_moodle_course_sync_state(v_connection_id, v_course.id, v_now);
    EXCEPTION WHEN OTHERS THEN
      -- A completed job is still authoritative even if a stale association
      -- disappeared concurrently. Never turn job finalization into a retry.
      CONTINUE;
    END;

    SELECT min(
      COALESCE(
        watermark_row.last_successful_sync_at + make_interval(secs => COALESCE(site_policy.stale_after_seconds, global_policy.stale_after_seconds)),
        v_now
      )
    )
    INTO v_next_incremental_at
    FROM unnest(ARRAY['students', 'activities', 'grades']::TEXT[]) AS entity_row(entity)
    LEFT JOIN public.moodle_sync_policies site_policy
      ON site_policy.moodle_site_id = v_site_id
     AND site_policy.entity = entity_row.entity
     AND site_policy.temperature = (
       SELECT temperature
       FROM public.moodle_course_sync_state
       WHERE moodle_connection_id = v_connection_id
         AND course_id = v_course.id
     )
    LEFT JOIN public.moodle_sync_policies global_policy
      ON global_policy.moodle_site_id IS NULL
     AND global_policy.entity = entity_row.entity
     AND global_policy.temperature = (
       SELECT temperature
       FROM public.moodle_course_sync_state
       WHERE moodle_connection_id = v_connection_id
         AND course_id = v_course.id
     )
    LEFT JOIN public.moodle_sync_watermarks watermark_row
      ON watermark_row.moodle_connection_id = v_connection_id
     AND watermark_row.course_id = v_course.id
     AND watermark_row.entity = entity_row.entity
    WHERE COALESCE(site_policy.enabled, global_policy.enabled, FALSE);

    UPDATE public.moodle_course_sync_state
    SET
      last_successful_sync_at = v_now,
      last_full_sync_at = CASE
        WHEN v_trigger IN ('initial', 'reconciliation') THEN v_now
        ELSE last_full_sync_at
      END,
      next_incremental_at = v_next_incremental_at,
      reason_codes = ARRAY['job_completed_' || v_trigger],
      last_error_codes = '{}'::JSONB,
      updated_at = v_now
    WHERE moodle_connection_id = v_connection_id
      AND course_id = v_course.id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_moodle_sync_state_on_terminal_job ON public.background_jobs;
CREATE TRIGGER update_moodle_sync_state_on_terminal_job
  AFTER UPDATE OF status ON public.background_jobs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed')
  EXECUTE FUNCTION public.backend_update_moodle_sync_state_on_terminal_job();

REVOKE ALL ON FUNCTION public.backend_dispatch_due_moodle_syncs(INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backend_update_moodle_sync_state_on_terminal_job()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backend_dispatch_due_moodle_syncs(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.backend_dispatch_due_moodle_syncs(INTEGER) IS
  'Claims due Claris course states with SKIP LOCKED and atomically queues deduplicated scheduler/reconciliation Moodle jobs without provider I/O.';
