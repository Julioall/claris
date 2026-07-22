-- Claris-first course snapshots and atomic stale-while-revalidate scheduling.
-- This layer never calls Moodle: it only validates scope and persists durable work.

ALTER TABLE public.moodle_course_sync_state
  ADD COLUMN IF NOT EXISTS last_error_codes JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD CONSTRAINT moodle_course_sync_state_error_codes_object
    CHECK (jsonb_typeof(last_error_codes) = 'object');

CREATE INDEX IF NOT EXISTS idx_moodle_course_sync_state_due
  ON public.moodle_course_sync_state (next_incremental_at, temperature)
  WHERE temperature <> 'archived';

CREATE OR REPLACE FUNCTION public.backend_request_course_refresh(
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
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_site_id UUID;
  v_entities TEXT[];
  v_source_record_id UUID;
  v_existing_job_id UUID;
  v_last_manual_refresh_at TIMESTAMPTZ;
  v_cooldown_seconds INTEGER := 60;
  v_retry_after INTEGER;
  v_job_id UUID := gen_random_uuid();
  v_entity TEXT;
  v_total_items INTEGER;
BEGIN
  IF p_trigger NOT IN ('scheduler', 'stale_read', 'manual', 'reconciliation') THEN
    RAISE EXCEPTION 'invalid_refresh_trigger' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT entity_value ORDER BY entity_value)
  INTO v_entities
  FROM unnest(COALESCE(p_entities, ARRAY[]::TEXT[])) entity_value
  WHERE entity_value IN ('students', 'activities', 'grades');

  IF v_entities IS NULL
    OR cardinality(v_entities) = 0
    OR cardinality(v_entities) <> cardinality(p_entities)
  THEN
    RAISE EXCEPTION 'invalid_refresh_entities' USING ERRCODE = '22023';
  END IF;

  SELECT connection_row.moodle_site_id
  INTO v_site_id
  FROM public.user_moodle_connections connection_row
  JOIN public.moodle_sites site_row
    ON site_row.id = connection_row.moodle_site_id
   AND site_row.status = 'approved'
  WHERE connection_row.id = p_moodle_connection_id
    AND connection_row.user_id = p_user_id
    AND connection_row.status IN ('active', 'reauth_required');

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'moodle_connection_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
  FROM public.courses course_row
  WHERE course_row.id = p_course_id
    AND course_row.moodle_site_id = v_site_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sync_course_site_mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.user_has_course_access(p_user_id, p_course_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_course_catalog_eligibility eligibility_row
      WHERE eligibility_row.user_id = p_user_id
        AND eligibility_row.moodle_connection_id = p_moodle_connection_id
        AND eligibility_row.course_id = p_course_id
    )
  THEN
    RAISE EXCEPTION 'course_access_denied' USING ERRCODE = '42501';
  END IF;

  -- Serialize equal requests before checking the partial unique index/cooldown.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_user_id::TEXT || ':' || p_moodle_connection_id::TEXT || ':' ||
      p_course_id::TEXT || ':' || array_to_string(v_entities, ','),
      0
    )
  );

  v_source_record_id := (
    substr(md5(p_user_id::TEXT || ':' || p_moodle_connection_id::TEXT || ':' ||
      p_course_id::TEXT || ':' || array_to_string(v_entities, ',') || ':incremental'), 1, 8) || '-' ||
    substr(md5(p_user_id::TEXT || ':' || p_moodle_connection_id::TEXT || ':' ||
      p_course_id::TEXT || ':' || array_to_string(v_entities, ',') || ':incremental'), 9, 4) || '-' ||
    substr(md5(p_user_id::TEXT || ':' || p_moodle_connection_id::TEXT || ':' ||
      p_course_id::TEXT || ':' || array_to_string(v_entities, ',') || ':incremental'), 13, 4) || '-' ||
    substr(md5(p_user_id::TEXT || ':' || p_moodle_connection_id::TEXT || ':' ||
      p_course_id::TEXT || ':' || array_to_string(v_entities, ',') || ':incremental'), 17, 4) || '-' ||
    substr(md5(p_user_id::TEXT || ':' || p_moodle_connection_id::TEXT || ':' ||
      p_course_id::TEXT || ':' || array_to_string(v_entities, ',') || ':incremental'), 21, 12)
  )::UUID;

  SELECT job_row.id
  INTO v_existing_job_id
  FROM public.background_jobs job_row
  JOIN public.moodle_sync_job_context context_row ON context_row.job_id = job_row.id
  WHERE job_row.user_id = p_user_id
    AND job_row.job_type = 'moodle_sync'
    AND job_row.source = 'sync'
    AND job_row.source_record_id = v_source_record_id
    AND job_row.status IN ('pending', 'processing')
    AND context_row.moodle_connection_id = p_moodle_connection_id
    AND context_row.schema_version = 2
  ORDER BY job_row.created_at DESC
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    RETURN QUERY SELECT
      'deduplicated'::TEXT,
      v_existing_job_id,
      NULL::INTEGER,
      v_now,
      v_entities,
      v_site_id;
    RETURN;
  END IF;

  INSERT INTO public.moodle_course_sync_state (
    moodle_connection_id,
    course_id,
    temperature,
    reason_codes,
    last_claris_access_at
  ) VALUES (
    p_moodle_connection_id,
    p_course_id,
    'cold',
    ARRAY['refresh_requested'],
    CASE WHEN p_trigger IN ('manual', 'stale_read') THEN v_now ELSE NULL END
  )
  ON CONFLICT (moodle_connection_id, course_id) DO UPDATE
  SET
    last_claris_access_at = CASE
      WHEN p_trigger IN ('manual', 'stale_read') THEN v_now
      ELSE public.moodle_course_sync_state.last_claris_access_at
    END,
    updated_at = v_now
  RETURNING last_manual_refresh_at INTO v_last_manual_refresh_at;

  SELECT COALESCE(site_policy.manual_cooldown_seconds, global_policy.manual_cooldown_seconds, 60)
  INTO v_cooldown_seconds
  FROM (SELECT 1) singleton
  LEFT JOIN public.moodle_sync_policies site_policy
    ON site_policy.moodle_site_id = v_site_id
   AND site_policy.entity = v_entities[1]
   AND site_policy.temperature = 'hot'
  LEFT JOIN public.moodle_sync_policies global_policy
    ON global_policy.moodle_site_id IS NULL
   AND global_policy.entity = v_entities[1]
   AND global_policy.temperature = 'hot';

  IF p_trigger = 'manual'
    AND v_last_manual_refresh_at IS NOT NULL
    AND v_last_manual_refresh_at + make_interval(secs => v_cooldown_seconds) > v_now
  THEN
    v_retry_after := greatest(
      1,
      ceil(extract(epoch FROM (
        v_last_manual_refresh_at + make_interval(secs => v_cooldown_seconds) - v_now
      )))::INTEGER
    );
    RETURN QUERY SELECT
      'cooldown'::TEXT,
      NULL::UUID,
      v_retry_after,
      v_now,
      v_entities,
      v_site_id;
    RETURN;
  END IF;

  v_total_items := cardinality(v_entities) + CASE WHEN 'students' = ANY(v_entities) THEN 1 ELSE 0 END;

  INSERT INTO public.background_jobs (
    id, user_id, course_id, job_type, source, source_table, source_record_id,
    title, description, status, total_items, metadata, created_at, updated_at
  ) VALUES (
    v_job_id, p_user_id, p_course_id, 'moodle_sync', 'sync',
    'moodle_sync_request', v_source_record_id,
    'Atualizacao de unidade curricular',
    'Atualizacao Claris-first enfileirada para processamento duravel.',
    'pending', v_total_items,
    jsonb_build_object(
      'connection_id', p_moodle_connection_id,
      'course_ids', jsonb_build_array(p_course_id),
      'entities', to_jsonb(v_entities),
      'schema_version', 2,
      'sync_kind', 'incremental',
      'trigger', p_trigger
    ),
    v_now, v_now
  );

  INSERT INTO public.moodle_sync_job_context (
    job_id, moodle_connection_id, schema_version, sync_policy
  ) VALUES (
    v_job_id, p_moodle_connection_id, 2,
    jsonb_build_object('trigger', p_trigger, 'delta_mode', 'shadow')
  );

  FOREACH v_entity IN ARRAY v_entities LOOP
    INSERT INTO public.background_job_items (
      id, job_id, user_id, item_key, label, status, progress_current,
      progress_total, metadata, available_at, max_attempts, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_job_id, p_user_id,
      v_entity || ':' || p_course_id::TEXT,
      CASE v_entity
        WHEN 'students' THEN 'Sincronizar alunos'
        WHEN 'activities' THEN 'Sincronizar atividades'
        ELSE 'Sincronizar notas'
      END,
      'pending', 0, 1,
      jsonb_build_object('course_id', p_course_id, 'entity', v_entity, 'delta_mode', 'shadow'),
      v_now, 3, v_now, v_now
    );
  END LOOP;

  IF 'students' = ANY(v_entities) THEN
    INSERT INTO public.background_job_items (
      id, job_id, user_id, item_key, label, status, progress_current,
      progress_total, metadata, available_at, max_attempts, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_job_id, p_user_id, 'risk', 'Recalcular risco',
      'pending', 0, 1, jsonb_build_object('entity', 'risk'), v_now, 3, v_now, v_now
    );
  END IF;

  UPDATE public.moodle_course_sync_state
  SET
    last_manual_refresh_at = CASE WHEN p_trigger = 'manual' THEN v_now ELSE last_manual_refresh_at END,
    reason_codes = ARRAY['refresh_' || p_trigger],
    updated_at = v_now
  WHERE moodle_connection_id = p_moodle_connection_id
    AND course_id = p_course_id;

  RETURN QUERY SELECT
    'queued'::TEXT,
    v_job_id,
    NULL::INTEGER,
    v_now,
    v_entities,
    v_site_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_reclassify_moodle_course_sync_state(
  p_moodle_connection_id UUID,
  p_course_id UUID,
  p_now TIMESTAMPTZ DEFAULT clock_timestamp()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_site_id UUID;
  v_course public.courses%ROWTYPE;
  v_temperature TEXT;
  v_reasons TEXT[];
  v_stale_seconds INTEGER;
BEGIN
  SELECT connection_row.user_id, connection_row.moodle_site_id
  INTO v_user_id, v_site_id
  FROM public.user_moodle_connections connection_row
  WHERE connection_row.id = p_moodle_connection_id;

  SELECT * INTO v_course
  FROM public.courses course_row
  WHERE course_row.id = p_course_id
    AND course_row.moodle_site_id = v_site_id;

  IF v_user_id IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'sync_course_site_mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.user_has_course_access(v_user_id, p_course_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_course_catalog_eligibility eligibility_row
      WHERE eligibility_row.user_id = v_user_id
        AND eligibility_row.moodle_connection_id = p_moodle_connection_id
        AND eligibility_row.course_id = p_course_id
    )
  THEN
    v_temperature := 'archived';
    v_reasons := ARRAY['outside_followup'];
  ELSIF EXISTS (
    SELECT 1 FROM public.moodle_course_sync_state state_row
    WHERE state_row.moodle_connection_id = p_moodle_connection_id
      AND state_row.course_id = p_course_id
      AND state_row.last_claris_access_at >= p_now - interval '24 hours'
  ) OR EXISTS (
    SELECT 1 FROM public.student_activities activity_row
    WHERE activity_row.course_id = p_course_id
      AND activity_row.due_date BETWEEN p_now AND p_now + interval '14 days'
  ) THEN
    v_temperature := 'hot';
    v_reasons := ARRAY['recent_access_or_due_date'];
  ELSIF (v_course.start_date IS NULL OR v_course.start_date <= p_now)
    AND (v_course.end_date IS NULL OR v_course.end_date >= p_now)
  THEN
    v_temperature := 'warm';
    v_reasons := ARRAY['ongoing'];
  ELSE
    v_temperature := 'cold';
    v_reasons := ARRAY['inactive_or_finished'];
  END IF;

  SELECT COALESCE(site_policy.stale_after_seconds, global_policy.stale_after_seconds, 86400)
  INTO v_stale_seconds
  FROM (SELECT 1) singleton
  LEFT JOIN public.moodle_sync_policies site_policy
    ON site_policy.moodle_site_id = v_site_id
   AND site_policy.entity = 'grades'
   AND site_policy.temperature = v_temperature
  LEFT JOIN public.moodle_sync_policies global_policy
    ON global_policy.moodle_site_id IS NULL
   AND global_policy.entity = 'grades'
   AND global_policy.temperature = v_temperature;

  INSERT INTO public.moodle_course_sync_state (
    moodle_connection_id, course_id, temperature, reason_codes, next_incremental_at
  ) VALUES (
    p_moodle_connection_id, p_course_id, v_temperature, v_reasons,
    CASE WHEN v_temperature = 'archived' THEN NULL ELSE p_now + make_interval(secs => v_stale_seconds) END
  )
  ON CONFLICT (moodle_connection_id, course_id) DO UPDATE
  SET
    temperature = EXCLUDED.temperature,
    reason_codes = EXCLUDED.reason_codes,
    next_incremental_at = EXCLUDED.next_incremental_at,
    updated_at = p_now;

  RETURN v_temperature;
END;
$$;

REVOKE ALL ON FUNCTION public.backend_request_course_refresh(UUID, UUID, UUID, TEXT[], TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backend_reclassify_moodle_course_sync_state(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backend_request_course_refresh(UUID, UUID, UUID, TEXT[], TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_reclassify_moodle_course_sync_state(UUID, UUID, TIMESTAMPTZ)
  TO service_role;

COMMENT ON FUNCTION public.backend_request_course_refresh(UUID, UUID, UUID, TEXT[], TEXT) IS
  'Atomically validates scope, applies manual cooldown, deduplicates, and queues a V2 Moodle sync without calling Moodle.';
