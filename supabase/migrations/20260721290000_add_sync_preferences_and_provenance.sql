-- 20260721290000_add_sync_preferences_and_provenance.sql

-- 1. Catalogo e elegibilidade por conexao
ALTER TABLE public.user_course_catalog_eligibility
  ADD COLUMN IF NOT EXISTS moodle_connection_id UUID REFERENCES public.user_moodle_connections(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_course_catalog_eligibility
    WHERE moodle_connection_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Greenfield Moodle eligibility requires an empty/reseeded development database';
  END IF;
END;
$$;

ALTER TABLE public.user_course_catalog_eligibility
  ALTER COLUMN moodle_connection_id SET NOT NULL,
  DROP CONSTRAINT IF EXISTS user_course_catalog_eligibility_pkey;

ALTER TABLE public.user_course_catalog_eligibility
  ADD CONSTRAINT user_course_catalog_eligibility_pkey
  PRIMARY KEY (user_id, moodle_connection_id, course_id);

CREATE INDEX IF NOT EXISTS idx_user_course_catalog_eligibility_connection
  ON public.user_course_catalog_eligibility (moodle_connection_id, course_id);

DROP FUNCTION IF EXISTS public.backend_replace_user_course_eligibility(UUID, UUID[]);
DROP FUNCTION IF EXISTS public.backend_link_eligible_user_courses(UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.backend_replace_user_course_eligibility(
  p_user_id UUID,
  p_moodle_connection_id UUID,
  p_course_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_course_ids UUID[];
  v_site_id UUID;
BEGIN
  SELECT connection_row.moodle_site_id
  INTO v_site_id
  FROM public.user_moodle_connections connection_row
  WHERE connection_row.id = p_moodle_connection_id
    AND connection_row.user_id = p_user_id
    AND connection_row.status IN ('active', 'reauth_required');

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'Moodle connection not found' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT course_id ORDER BY course_id), ARRAY[]::UUID[])
  INTO v_course_ids
  FROM unnest(COALESCE(p_course_ids, ARRAY[]::UUID[])) AS course_row(course_id)
  WHERE course_id IS NOT NULL;

  IF cardinality(v_course_ids) > 2000 THEN
    RAISE EXCEPTION 'Course eligibility batch is too large' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*)
    FROM public.courses course_row
    WHERE course_row.id = ANY(v_course_ids)
      AND course_row.moodle_site_id = v_site_id
  ) <> cardinality(v_course_ids) THEN
    RAISE EXCEPTION 'Course is outside Moodle connection site' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.user_course_catalog_eligibility eligibility_row
  WHERE eligibility_row.user_id = p_user_id
    AND eligibility_row.moodle_connection_id = p_moodle_connection_id
    AND NOT (eligibility_row.course_id = ANY(v_course_ids));

  INSERT INTO public.user_course_catalog_eligibility (
    user_id,
    moodle_connection_id,
    course_id,
    discovered_at
  )
  SELECT p_user_id, p_moodle_connection_id, course_id, now()
  FROM unnest(v_course_ids) AS course_row(course_id)
  ON CONFLICT (user_id, moodle_connection_id, course_id) DO UPDATE
  SET discovered_at = EXCLUDED.discovered_at;

  RETURN cardinality(v_course_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_link_eligible_user_courses(
  p_user_id UUID,
  p_moodle_connection_id UUID,
  p_course_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_course_ids UUID[];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_moodle_connections connection_row
    WHERE connection_row.id = p_moodle_connection_id
      AND connection_row.user_id = p_user_id
      AND connection_row.status IN ('active', 'reauth_required')
  ) THEN
    RAISE EXCEPTION 'Moodle connection not found' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT course_id ORDER BY course_id), ARRAY[]::UUID[])
  INTO v_course_ids
  FROM unnest(COALESCE(p_course_ids, ARRAY[]::UUID[])) AS course_row(course_id)
  WHERE course_id IS NOT NULL;

  IF cardinality(v_course_ids) = 0 OR cardinality(v_course_ids) > 500 THEN
    RAISE EXCEPTION 'Course selection is invalid' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_course_ids) AS selected_row(course_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.user_course_catalog_eligibility eligibility_row
      WHERE eligibility_row.user_id = p_user_id
        AND eligibility_row.moodle_connection_id = p_moodle_connection_id
        AND eligibility_row.course_id = selected_row.course_id
    )
  ) THEN
    RAISE EXCEPTION 'Course selection is outside Moodle eligibility' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_courses (user_id, course_id, role)
  SELECT p_user_id, course_id, 'tutor'
  FROM unnest(v_course_ids) AS selected_row(course_id)
  ON CONFLICT (user_id, course_id) DO UPDATE
  SET role = 'tutor';

  RETURN cardinality(v_course_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.backend_replace_user_course_eligibility(UUID, UUID, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backend_link_eligible_user_courses(UUID, UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backend_replace_user_course_eligibility(UUID, UUID, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_link_eligible_user_courses(UUID, UUID, UUID[]) TO service_role;

-- 2. Acesso e preferencias por conexao
CREATE TABLE IF NOT EXISTS public.user_moodle_sync_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  moodle_connection_id UUID NOT NULL REFERENCES public.user_moodle_connections(id) ON DELETE CASCADE,
  selected_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  include_empty_courses BOOLEAN NOT NULL DEFAULT false,
  include_finished_courses BOOLEAN NOT NULL DEFAULT false,
  display_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, moodle_connection_id),
  CHECK (jsonb_typeof(selected_keys) = 'array'),
  CHECK (jsonb_typeof(display_preferences) = 'object')
);

-- 3. Controle incremental e cache
CREATE TABLE IF NOT EXISTS public.moodle_sync_watermarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moodle_connection_id UUID NOT NULL REFERENCES public.user_moodle_connections(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  last_successful_sync_at TIMESTAMPTZ,
  moodle_since TIMESTAMPTZ,
  source_release TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (moodle_connection_id, course_id, entity),
  CHECK (entity IN ('students', 'activities', 'grades'))
);

CREATE TABLE IF NOT EXISTS public.moodle_category_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moodle_connection_id UUID NOT NULL REFERENCES public.user_moodle_connections(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL DEFAULT 'visible_categories',
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (moodle_connection_id, cache_key),
  CHECK (jsonb_typeof(categories) = 'array'),
  CHECK (byte_size >= 0 AND byte_size <= 4194304),
  CHECK (expires_at > observed_at)
);

-- 4. Politica adaptativa de frescor
CREATE TABLE IF NOT EXISTS public.moodle_sync_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moodle_site_id UUID REFERENCES public.moodle_sites(id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  temperature TEXT NOT NULL,
  stale_after_seconds INTEGER NOT NULL,
  full_reconcile_after_seconds INTEGER NOT NULL,
  manual_cooldown_seconds INTEGER NOT NULL DEFAULT 60,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (entity IN ('students', 'activities', 'grades')),
  CHECK (temperature IN ('hot', 'warm', 'cold', 'archived')),
  CHECK (stale_after_seconds > 0),
  CHECK (full_reconcile_after_seconds > 0),
  CHECK (manual_cooldown_seconds >= 0)
);

CREATE UNIQUE INDEX idx_moodle_sync_policies_site_entity_temp 
ON public.moodle_sync_policies (moodle_site_id, entity, temperature) 
WHERE moodle_site_id IS NOT NULL;

CREATE UNIQUE INDEX idx_moodle_sync_policies_global_entity_temp 
ON public.moodle_sync_policies (entity, temperature) 
WHERE moodle_site_id IS NULL;

INSERT INTO public.moodle_sync_policies (
  moodle_site_id,
  entity,
  temperature,
  stale_after_seconds,
  full_reconcile_after_seconds,
  manual_cooldown_seconds,
  enabled
)
VALUES
  (NULL, 'students', 'hot', 1800, 86400, 60, true),
  (NULL, 'students', 'warm', 14400, 604800, 60, true),
  (NULL, 'students', 'cold', 86400, 2592000, 60, true),
  (NULL, 'students', 'archived', 315360000, 315360000, 60, false),
  (NULL, 'activities', 'hot', 1800, 86400, 60, true),
  (NULL, 'activities', 'warm', 3600, 604800, 60, true),
  (NULL, 'activities', 'cold', 86400, 2592000, 60, true),
  (NULL, 'activities', 'archived', 315360000, 315360000, 60, false),
  (NULL, 'grades', 'hot', 600, 86400, 60, true),
  (NULL, 'grades', 'warm', 3600, 604800, 60, true),
  (NULL, 'grades', 'cold', 86400, 2592000, 60, true),
  (NULL, 'grades', 'archived', 315360000, 315360000, 60, false)
ON CONFLICT (entity, temperature) WHERE moodle_site_id IS NULL DO UPDATE SET
  stale_after_seconds = EXCLUDED.stale_after_seconds,
  full_reconcile_after_seconds = EXCLUDED.full_reconcile_after_seconds,
  manual_cooldown_seconds = EXCLUDED.manual_cooldown_seconds,
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS public.moodle_course_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moodle_connection_id UUID NOT NULL REFERENCES public.user_moodle_connections(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  temperature TEXT NOT NULL DEFAULT 'cold',
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  last_claris_access_at TIMESTAMPTZ,
  next_incremental_at TIMESTAMPTZ,
  last_manual_refresh_at TIMESTAMPTZ,
  last_full_sync_at TIMESTAMPTZ,
  last_successful_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (moodle_connection_id, course_id),
  CHECK (temperature IN ('hot', 'warm', 'cold', 'archived'))
);

-- 5. Jobs e leases
CREATE TABLE IF NOT EXISTS public.moodle_sync_job_context (
  job_id UUID PRIMARY KEY REFERENCES public.background_jobs(id) ON DELETE CASCADE,
  moodle_connection_id UUID NOT NULL REFERENCES public.user_moodle_connections(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL DEFAULT 2,
  sync_policy JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Adding execution fields to background_job_items if they don't exist
ALTER TABLE public.background_job_items
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS leased_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS cursor JSONB,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT;

ALTER TABLE public.background_job_items
  ALTER COLUMN available_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_background_job_items_claim
  ON public.background_job_items (status, available_at, leased_until)
  WHERE status IN ('pending', 'processing');

-- 6. Provenance columns on entities
-- Courses
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_connection_id UUID REFERENCES public.user_moodle_connections(id) ON DELETE SET NULL;

-- Students
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_synced_connection_id UUID REFERENCES public.user_moodle_connections(id) ON DELETE SET NULL;

ALTER TABLE public.student_activities
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_connection_id UUID REFERENCES public.user_moodle_connections(id) ON DELETE SET NULL;

ALTER TABLE public.student_course_grades
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_connection_id UUID REFERENCES public.user_moodle_connections(id) ON DELETE SET NULL;

-- 7. Triggers
DROP TRIGGER IF EXISTS update_user_moodle_sync_preferences_updated_at ON public.user_moodle_sync_preferences;
CREATE TRIGGER update_user_moodle_sync_preferences_updated_at
  BEFORE UPDATE ON public.user_moodle_sync_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_moodle_sync_watermarks_updated_at ON public.moodle_sync_watermarks;
CREATE TRIGGER update_moodle_sync_watermarks_updated_at
  BEFORE UPDATE ON public.moodle_sync_watermarks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_moodle_category_cache_updated_at ON public.moodle_category_cache;
CREATE TRIGGER update_moodle_category_cache_updated_at
  BEFORE UPDATE ON public.moodle_category_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_moodle_sync_policies_updated_at ON public.moodle_sync_policies;
CREATE TRIGGER update_moodle_sync_policies_updated_at
  BEFORE UPDATE ON public.moodle_sync_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_moodle_course_sync_state_updated_at ON public.moodle_course_sync_state;
CREATE TRIGGER update_moodle_course_sync_state_updated_at
  BEFORE UPDATE ON public.moodle_course_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.validate_moodle_connection_course_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  connection_site_id UUID;
  course_site_id UUID;
BEGIN
  SELECT moodle_site_id INTO connection_site_id
  FROM public.user_moodle_connections
  WHERE id = NEW.moodle_connection_id;

  SELECT moodle_site_id INTO course_site_id
  FROM public.courses
  WHERE id = NEW.course_id;

  IF connection_site_id IS NULL OR course_site_id IS NULL OR connection_site_id <> course_site_id THEN
    RAISE EXCEPTION 'Moodle connection and course must belong to the same site';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_moodle_sync_watermark_scope ON public.moodle_sync_watermarks;
CREATE TRIGGER validate_moodle_sync_watermark_scope
  BEFORE INSERT OR UPDATE OF moodle_connection_id, course_id ON public.moodle_sync_watermarks
  FOR EACH ROW EXECUTE FUNCTION public.validate_moodle_connection_course_scope();

DROP TRIGGER IF EXISTS validate_moodle_course_sync_state_scope ON public.moodle_course_sync_state;
CREATE TRIGGER validate_moodle_course_sync_state_scope
  BEFORE INSERT OR UPDATE OF moodle_connection_id, course_id ON public.moodle_course_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.validate_moodle_connection_course_scope();

CREATE OR REPLACE FUNCTION public.validate_moodle_connection_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_moodle_connections
    WHERE id = NEW.moodle_connection_id
      AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Moodle connection must belong to the preference owner';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_user_moodle_sync_preferences_owner ON public.user_moodle_sync_preferences;
CREATE TRIGGER validate_user_moodle_sync_preferences_owner
  BEFORE INSERT OR UPDATE OF user_id, moodle_connection_id ON public.user_moodle_sync_preferences
  FOR EACH ROW EXECUTE FUNCTION public.validate_moodle_connection_owner();

CREATE OR REPLACE FUNCTION public.validate_moodle_eligibility_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_moodle_connections connection
    JOIN public.courses course_row
      ON course_row.id = NEW.course_id
     AND course_row.moodle_site_id = connection.moodle_site_id
    WHERE connection.id = NEW.moodle_connection_id
      AND connection.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Moodle eligibility owner, connection and course scope are inconsistent';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_user_course_catalog_eligibility_scope
  ON public.user_course_catalog_eligibility;
CREATE TRIGGER validate_user_course_catalog_eligibility_scope
  BEFORE INSERT OR UPDATE OF user_id, moodle_connection_id, course_id
  ON public.user_course_catalog_eligibility
  FOR EACH ROW EXECUTE FUNCTION public.validate_moodle_eligibility_scope();

CREATE OR REPLACE FUNCTION public.validate_moodle_job_context_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.background_jobs job
    JOIN public.user_moodle_connections connection
      ON connection.id = NEW.moodle_connection_id
    WHERE job.id = NEW.job_id
      AND job.user_id = connection.user_id
  ) THEN
    RAISE EXCEPTION 'Moodle job and connection must belong to the same user';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_moodle_sync_job_context_owner ON public.moodle_sync_job_context;
CREATE TRIGGER validate_moodle_sync_job_context_owner
  BEFORE INSERT OR UPDATE OF job_id, moodle_connection_id ON public.moodle_sync_job_context
  FOR EACH ROW EXECUTE FUNCTION public.validate_moodle_job_context_owner();

-- RLS
ALTER TABLE public.user_moodle_sync_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodle_sync_watermarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodle_category_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodle_sync_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodle_course_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodle_sync_job_context ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_moodle_sync_preferences FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.moodle_sync_watermarks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.moodle_category_cache FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.moodle_sync_policies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.moodle_course_sync_state FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.moodle_sync_job_context FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.user_moodle_sync_preferences TO service_role;
GRANT ALL ON TABLE public.moodle_sync_watermarks TO service_role;
GRANT ALL ON TABLE public.moodle_category_cache TO service_role;
GRANT ALL ON TABLE public.moodle_sync_policies TO service_role;
GRANT ALL ON TABLE public.moodle_course_sync_state TO service_role;
GRANT ALL ON TABLE public.moodle_sync_job_context TO service_role;
