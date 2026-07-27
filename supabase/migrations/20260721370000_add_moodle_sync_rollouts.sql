-- Server-side Moodle synchronization rollout controls.
--
-- A site row is the mandatory kill switch for a capability.  It defaults to
-- disabled and always takes precedence over any per-user row, so changing one
-- site row to false stops new work immediately.  Optional user rows form an
-- allow-list only when at least one user row exists for that site/capability.

CREATE TABLE IF NOT EXISTS public.moodle_sync_rollouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moodle_site_id UUID NOT NULL REFERENCES public.moodle_sites(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT moodle_sync_rollouts_capability_check
    CHECK (capability IN ('worker', 'bulk', 'delta', 'freshness'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_moodle_sync_rollouts_site_capability
  ON public.moodle_sync_rollouts (moodle_site_id, capability)
  WHERE user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_moodle_sync_rollouts_user_capability
  ON public.moodle_sync_rollouts (moodle_site_id, user_id, capability)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moodle_sync_rollouts_lookup
  ON public.moodle_sync_rollouts (moodle_site_id, capability, user_id);

ALTER TABLE public.moodle_sync_rollouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.moodle_sync_rollouts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.moodle_sync_rollouts TO service_role;

DROP TRIGGER IF EXISTS update_moodle_sync_rollouts_updated_at ON public.moodle_sync_rollouts;
CREATE TRIGGER update_moodle_sync_rollouts_updated_at
  BEFORE UPDATE ON public.moodle_sync_rollouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.backend_moodle_sync_rollout_enabled(
  p_moodle_site_id UUID,
  p_user_id UUID,
  p_capability TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_site_enabled BOOLEAN;
  v_has_user_rules BOOLEAN;
  v_user_enabled BOOLEAN;
BEGIN
  IF p_moodle_site_id IS NULL
    OR p_user_id IS NULL
    OR p_capability NOT IN ('worker', 'bulk', 'delta', 'freshness') THEN
    RETURN FALSE;
  END IF;

  SELECT rollout_row.enabled
  INTO v_site_enabled
  FROM public.moodle_sync_rollouts rollout_row
  WHERE rollout_row.moodle_site_id = p_moodle_site_id
    AND rollout_row.capability = p_capability
    AND rollout_row.user_id IS NULL;

  -- Secure default: a missing site control is always disabled.
  IF COALESCE(v_site_enabled, FALSE) IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.moodle_sync_rollouts rollout_row
    WHERE rollout_row.moodle_site_id = p_moodle_site_id
      AND rollout_row.capability = p_capability
      AND rollout_row.user_id IS NOT NULL
  )
  INTO v_has_user_rules;

  IF NOT v_has_user_rules THEN
    RETURN TRUE;
  END IF;

  SELECT rollout_row.enabled
  INTO v_user_enabled
  FROM public.moodle_sync_rollouts rollout_row
  WHERE rollout_row.moodle_site_id = p_moodle_site_id
    AND rollout_row.capability = p_capability
    AND rollout_row.user_id = p_user_id;

  RETURN COALESCE(v_user_enabled, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_moodle_sync_connection_rollout_enabled(
  p_user_id UUID,
  p_moodle_connection_id UUID,
  p_capability TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_site_id UUID;
BEGIN
  SELECT connection_row.moodle_site_id
  INTO v_site_id
  FROM public.user_moodle_connections connection_row
  JOIN public.moodle_sites site_row
    ON site_row.id = connection_row.moodle_site_id
   AND site_row.status = 'approved'
  WHERE connection_row.id = p_moodle_connection_id
    AND connection_row.user_id = p_user_id
    AND connection_row.status IN ('active', 'reauth_required');

  RETURN v_site_id IS NOT NULL
    AND public.backend_moodle_sync_rollout_enabled(v_site_id, p_user_id, p_capability);
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_set_moodle_sync_rollout(
  p_actor_id UUID,
  p_moodle_site_id UUID,
  p_capability TEXT,
  p_enabled BOOLEAN,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.moodle_sync_rollouts%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR NOT public.is_user_application_admin(p_actor_id) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_capability NOT IN ('worker', 'bulk', 'delta', 'freshness') OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Invalid Moodle sync rollout control' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moodle_sites WHERE id = p_moodle_site_id) THEN
    RAISE EXCEPTION 'Moodle site not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Claris user not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_user_id IS NULL THEN
    INSERT INTO public.moodle_sync_rollouts (
      moodle_site_id, user_id, capability, enabled, updated_by
    ) VALUES (
      p_moodle_site_id, NULL, p_capability, p_enabled, p_actor_id
    )
    ON CONFLICT (moodle_site_id, capability) WHERE user_id IS NULL DO UPDATE
    SET enabled = EXCLUDED.enabled,
        updated_by = EXCLUDED.updated_by,
        updated_at = clock_timestamp()
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.moodle_sync_rollouts (
      moodle_site_id, user_id, capability, enabled, updated_by
    ) VALUES (
      p_moodle_site_id, p_user_id, p_capability, p_enabled, p_actor_id
    )
    ON CONFLICT (moodle_site_id, user_id, capability) WHERE user_id IS NOT NULL DO UPDATE
    SET enabled = EXCLUDED.enabled,
        updated_by = EXCLUDED.updated_by,
        updated_at = clock_timestamp()
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'capability', v_row.capability,
    'enabled', v_row.enabled,
    'moodle_site_id', v_row.moodle_site_id,
    'updated_at', v_row.updated_at,
    'user_id', v_row.user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_list_moodle_sync_rollouts(
  p_actor_id UUID
)
RETURNS TABLE (
  capability TEXT,
  enabled BOOLEAN,
  moodle_site_id UUID,
  updated_at TIMESTAMPTZ,
  updated_by UUID,
  user_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_actor_id IS NULL OR NOT public.is_user_application_admin(p_actor_id) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    rollout_row.capability,
    rollout_row.enabled,
    rollout_row.moodle_site_id,
    rollout_row.updated_at,
    rollout_row.updated_by,
    rollout_row.user_id
  FROM public.moodle_sync_rollouts rollout_row
  ORDER BY rollout_row.moodle_site_id, rollout_row.capability, rollout_row.user_id NULLS FIRST;
END;
$$;

-- Gate bulk-job creation in addition to the Edge-layer check. This keeps the
-- capability server-side if a future caller bypasses the use-case service.
CREATE OR REPLACE FUNCTION public.backend_create_moodle_sync_job_v2_gated(
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
BEGIN
  IF NOT public.backend_moodle_sync_connection_rollout_enabled(
    p_user_id, p_moodle_connection_id, 'bulk'
  ) THEN
    RAISE EXCEPTION 'Moodle bulk synchronization rollout is disabled' USING ERRCODE = 'P0001';
  END IF;

  RETURN public.backend_create_moodle_sync_job_v2(
    p_user_id,
    p_moodle_connection_id,
    p_source_record_id,
    p_sync_kind,
    p_course_ids,
    p_entities,
    p_trigger,
    p_items
  );
END;
$$;

-- Gate freshness scheduling atomically with the scheduler RPC. The original
-- function remains a service-only primitive; all application callers use this
-- wrapper so a switch-off cannot enqueue a refresh between checks.
CREATE OR REPLACE FUNCTION public.backend_request_course_refresh_gated(
  p_user_id UUID,
  p_moodle_connection_id UUID,
  p_course_id UUID,
  p_entities TEXT[],
  p_trigger TEXT
)
RETURNS TABLE (
  refresh_status TEXT,
  job_id UUID,
  retry_after_seconds INTEGER,
  requested_at TIMESTAMPTZ,
  accepted_entities TEXT[],
  moodle_site_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.backend_moodle_sync_connection_rollout_enabled(
    p_user_id, p_moodle_connection_id, 'freshness'
  ) THEN
    RAISE EXCEPTION 'Moodle freshness rollout is disabled' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT * FROM public.backend_request_course_refresh(
    p_user_id,
    p_moodle_connection_id,
    p_course_id,
    p_entities,
    p_trigger
  );
END;
$$;

-- The worker claim is the final execution gate. Pending items remain pending
-- when disabled, which makes rollback/re-enable safe and does not consume an
-- attempt or issue any Moodle request.
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
      AND public.backend_moodle_sync_rollout_enabled(
        connection_row.moodle_site_id, job_row.user_id, 'worker'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.moodle_site_circuit_breakers circuit_row
        WHERE circuit_row.moodle_site_id = connection_row.moodle_site_id
          AND circuit_row.state = 'open'
          AND circuit_row.open_until > v_now
      )
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
            AND prerequisite.item_key <> 'risk'
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

REVOKE ALL ON FUNCTION public.backend_moodle_sync_rollout_enabled(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backend_moodle_sync_connection_rollout_enabled(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backend_set_moodle_sync_rollout(UUID, UUID, TEXT, BOOLEAN, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backend_list_moodle_sync_rollouts(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backend_create_moodle_sync_job_v2_gated(UUID, UUID, UUID, TEXT, UUID[], TEXT[], TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backend_request_course_refresh_gated(UUID, UUID, UUID, TEXT[], TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backend_claim_moodle_sync_item(TEXT, UUID, INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;

-- The ungated primitives are no longer callable by application code. The
-- wrappers above execute with their owner privileges and are the only path
-- granted to the service role.
REVOKE EXECUTE ON FUNCTION public.backend_create_moodle_sync_job_v2(UUID, UUID, UUID, TEXT, UUID[], TEXT[], TEXT, JSONB)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.backend_request_course_refresh(UUID, UUID, UUID, TEXT[], TEXT)
  FROM service_role;

GRANT EXECUTE ON FUNCTION public.backend_moodle_sync_rollout_enabled(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_moodle_sync_connection_rollout_enabled(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_set_moodle_sync_rollout(UUID, UUID, TEXT, BOOLEAN, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_list_moodle_sync_rollouts(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_create_moodle_sync_job_v2_gated(UUID, UUID, UUID, TEXT, UUID[], TEXT[], TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_request_course_refresh_gated(UUID, UUID, UUID, TEXT[], TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_claim_moodle_sync_item(TEXT, UUID, INTEGER, INTEGER, INTEGER) TO service_role;

COMMENT ON TABLE public.moodle_sync_rollouts IS
  'Service-side Moodle rollout controls. Site rows are kill switches; optional user rows enable staged allow-lists.';
