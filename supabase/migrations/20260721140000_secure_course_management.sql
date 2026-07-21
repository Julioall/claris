-- Epic 4: secure course-management commands behind authenticated Edge Functions.

-- The catalog RPC is an implementation detail of the backend. It previously
-- accepted an arbitrary user id and was executable by browser roles.
-- Keep its legacy shape for the Edge Function, but never return courses outside
-- the authenticated actor's associations (application admins retain global
-- visibility). This prevents catalog reads from becoming an access-escalation
-- oracle for student and risk data.
CREATE OR REPLACE FUNCTION public.get_user_courses_catalog_with_stats(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  moodle_course_id TEXT,
  name TEXT,
  short_name TEXT,
  category TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  student_count BIGINT,
  at_risk_count BIGINT,
  is_following BOOLEAN,
  is_ignored BOOLEAN,
  is_attendance_enabled BOOLEAN,
  student_ids UUID[]
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    course_row.id,
    course_row.moodle_course_id,
    course_row.name,
    course_row.short_name,
    course_row.category,
    course_row.start_date,
    course_row.end_date,
    course_row.last_sync,
    course_row.created_at,
    course_row.updated_at,
    COUNT(DISTINCT enrollment_row.student_id)::BIGINT AS student_count,
    COUNT(DISTINCT CASE
      WHEN student_row.current_risk_level IN ('risco', 'critico')
        AND (course_row.start_date IS NULL OR course_row.start_date <= NOW())
        AND (course_row.end_date IS NULL OR course_row.end_date >= NOW())
      THEN enrollment_row.student_id
    END)::BIGINT AS at_risk_count,
    COALESCE(association_row.role = 'tutor', false) AS is_following,
    (ignored_row.course_id IS NOT NULL) AS is_ignored,
    (attendance_setting_row.course_id IS NOT NULL) AS is_attendance_enabled,
    COALESCE(
      ARRAY_AGG(DISTINCT enrollment_row.student_id)
        FILTER (WHERE enrollment_row.student_id IS NOT NULL),
      '{}'::UUID[]
    ) AS student_ids
  FROM public.courses course_row
  LEFT JOIN public.user_courses association_row
    ON association_row.course_id = course_row.id
   AND association_row.user_id = p_user_id
  LEFT JOIN public.user_ignored_courses ignored_row
    ON ignored_row.course_id = course_row.id
   AND ignored_row.user_id = p_user_id
  LEFT JOIN public.attendance_course_settings attendance_setting_row
    ON attendance_setting_row.course_id = course_row.id
   AND attendance_setting_row.user_id = p_user_id
  LEFT JOIN public.student_courses enrollment_row
    ON enrollment_row.course_id = course_row.id
  LEFT JOIN public.students student_row
    ON student_row.id = enrollment_row.student_id
  WHERE public.is_user_application_admin(p_user_id)
     OR association_row.user_id IS NOT NULL
  GROUP BY
    course_row.id,
    course_row.moodle_course_id,
    course_row.name,
    course_row.short_name,
    course_row.category,
    course_row.start_date,
    course_row.end_date,
    course_row.last_sync,
    course_row.created_at,
    course_row.updated_at,
    association_row.role,
    ignored_row.course_id,
    attendance_setting_row.course_id
  ORDER BY course_row.name, course_row.id
$$;

REVOKE ALL ON FUNCTION public.get_user_courses_catalog_with_stats(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_courses_catalog_with_stats(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.get_user_courses_catalog_with_stats(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_courses_catalog_with_stats(UUID) TO service_role;

INSERT INTO public.app_permission_definitions (key, category, label, description, sort_order)
VALUES
  (
    'courses.activities.visibility.manage',
    'Cursos',
    'Visibilidade de atividades',
    'Ocultar ou exibir atividades nas metricas do curso.',
    31
  ),
  (
    'courses.attendance.manage',
    'Cursos',
    'Controle de presenca',
    'Configurar e registrar presencas nos cursos autorizados.',
    32
  )
ON CONFLICT (key) DO UPDATE
SET
  category = EXCLUDED.category,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Preserve the behaviour of the built-in operational groups while allowing
-- custom groups to opt in explicitly through the admin permission editor.
INSERT INTO public.app_group_permissions (group_id, permission_key)
SELECT group_row.id, permission_row.permission_key
FROM public.app_groups group_row
CROSS JOIN unnest(ARRAY[
  'courses.activities.visibility.manage',
  'courses.attendance.manage'
]::TEXT[]) AS permission_row(permission_key)
WHERE group_row.slug IN ('tutor', 'monitor')
ON CONFLICT (group_id, permission_key) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.user_courses'::regclass
      AND conname = 'user_courses_role_check'
  ) THEN
    ALTER TABLE public.user_courses
      ADD CONSTRAINT user_courses_role_check CHECK (role IN ('tutor', 'viewer'));
  END IF;
END $$;

UPDATE public.user_courses
SET role = 'tutor'
WHERE role IS NULL;

ALTER TABLE public.user_courses
  ALTER COLUMN role SET NOT NULL;

-- Courses discovered from the authenticated user's Moodle session are the
-- only courses that may create a new user association. Browser-provided ids
-- alone are never proof of eligibility.
CREATE TABLE IF NOT EXISTS public.user_course_catalog_eligibility (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);

ALTER TABLE public.user_course_catalog_eligibility ENABLE ROW LEVEL SECURITY;

INSERT INTO public.user_course_catalog_eligibility (user_id, course_id)
SELECT association_row.user_id, association_row.course_id
FROM public.user_courses association_row
ON CONFLICT (user_id, course_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.backend_replace_user_course_eligibility(
  p_user_id UUID,
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
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required' USING ERRCODE = '22023';
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
  ) <> cardinality(v_course_ids) THEN
    RAISE EXCEPTION 'Course not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.user_course_catalog_eligibility eligibility_row
  WHERE eligibility_row.user_id = p_user_id
    AND NOT (eligibility_row.course_id = ANY(v_course_ids));

  INSERT INTO public.user_course_catalog_eligibility (user_id, course_id, discovered_at)
  SELECT p_user_id, course_id, now()
  FROM unnest(v_course_ids) AS course_row(course_id)
  ON CONFLICT (user_id, course_id) DO UPDATE
  SET discovered_at = EXCLUDED.discovered_at;

  RETURN cardinality(v_course_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_link_eligible_user_courses(
  p_user_id UUID,
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
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required' USING ERRCODE = '22023';
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

CREATE OR REPLACE FUNCTION public.backend_set_user_course_roles(
  p_user_id UUID,
  p_course_ids UUID[],
  p_role TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_course_ids UUID[];
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required' USING ERRCODE = '22023';
  END IF;

  IF p_role NOT IN ('tutor', 'viewer') THEN
    RAISE EXCEPTION 'Invalid course role' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT course_id ORDER BY course_id), ARRAY[]::UUID[])
  INTO v_course_ids
  FROM unnest(COALESCE(p_course_ids, ARRAY[]::UUID[])) AS course_row(course_id)
  WHERE course_id IS NOT NULL;

  IF cardinality(v_course_ids) = 0 THEN
    RETURN 0;
  END IF;

  IF cardinality(v_course_ids) > 200 THEN
    RAISE EXCEPTION 'Course batch is too large' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*)
    FROM public.courses course_row
    WHERE course_row.id = ANY(v_course_ids)
  ) <> cardinality(v_course_ids) THEN
    RAISE EXCEPTION 'Course not found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_course_ids) AS course_row(course_id)
    WHERE NOT public.user_has_course_access(p_user_id, course_id)
  ) THEN
    RAISE EXCEPTION 'Course access denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_courses (user_id, course_id, role)
  SELECT p_user_id, course_id, p_role
  FROM unnest(v_course_ids) AS course_row(course_id)
  ON CONFLICT (user_id, course_id) DO UPDATE
  SET role = EXCLUDED.role;

  RETURN cardinality(v_course_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_set_user_courses_ignored(
  p_user_id UUID,
  p_course_ids UUID[],
  p_ignored BOOLEAN
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_course_ids UUID[];
BEGIN
  IF p_user_id IS NULL OR p_ignored IS NULL THEN
    RAISE EXCEPTION 'User id and ignored state are required' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT course_id ORDER BY course_id), ARRAY[]::UUID[])
  INTO v_course_ids
  FROM unnest(COALESCE(p_course_ids, ARRAY[]::UUID[])) AS course_row(course_id)
  WHERE course_id IS NOT NULL;

  IF cardinality(v_course_ids) = 0 THEN
    RETURN 0;
  END IF;

  IF cardinality(v_course_ids) > 200 THEN
    RAISE EXCEPTION 'Course batch is too large' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*)
    FROM public.courses course_row
    WHERE course_row.id = ANY(v_course_ids)
  ) <> cardinality(v_course_ids) THEN
    RAISE EXCEPTION 'Course not found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_course_ids) AS course_row(course_id)
    WHERE NOT public.user_has_course_access(p_user_id, course_id)
  ) THEN
    RAISE EXCEPTION 'Course access denied' USING ERRCODE = '42501';
  END IF;

  IF p_ignored THEN
    INSERT INTO public.user_ignored_courses (user_id, course_id)
    SELECT p_user_id, course_id
    FROM unnest(v_course_ids) AS course_row(course_id)
    ON CONFLICT (user_id, course_id) DO NOTHING;
  ELSE
    DELETE FROM public.user_ignored_courses
    WHERE user_id = p_user_id
      AND course_id = ANY(v_course_ids);
  END IF;

  RETURN cardinality(v_course_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_set_course_attendance_enabled(
  p_user_id UUID,
  p_course_ids UUID[],
  p_enabled BOOLEAN
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_course_ids UUID[];
BEGIN
  IF p_user_id IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'User id and enabled state are required' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT course_id ORDER BY course_id), ARRAY[]::UUID[])
  INTO v_course_ids
  FROM unnest(COALESCE(p_course_ids, ARRAY[]::UUID[])) AS course_row(course_id)
  WHERE course_id IS NOT NULL;

  IF cardinality(v_course_ids) = 0 THEN
    RETURN 0;
  END IF;

  IF cardinality(v_course_ids) > 200 THEN
    RAISE EXCEPTION 'Course batch is too large' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*)
    FROM public.courses course_row
    WHERE course_row.id = ANY(v_course_ids)
  ) <> cardinality(v_course_ids) THEN
    RAISE EXCEPTION 'Course not found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_course_ids) AS course_row(course_id)
    WHERE NOT public.user_has_course_access(p_user_id, course_id)
  ) THEN
    RAISE EXCEPTION 'Course access denied' USING ERRCODE = '42501';
  END IF;

  IF p_enabled THEN
    INSERT INTO public.attendance_course_settings (user_id, course_id)
    SELECT p_user_id, course_id
    FROM unnest(v_course_ids) AS course_row(course_id)
    ON CONFLICT (user_id, course_id) DO NOTHING;
  ELSE
    DELETE FROM public.attendance_course_settings
    WHERE user_id = p_user_id
      AND course_id = ANY(v_course_ids);
  END IF;

  RETURN cardinality(v_course_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_get_attendance_date_summaries(
  p_user_id UUID,
  p_course_id UUID
)
RETURNS TABLE (
  date DATE,
  presente BIGINT,
  ausente BIGINT,
  justificado BIGINT,
  total BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
BEGIN
  IF p_user_id IS NULL OR p_course_id IS NULL THEN
    RAISE EXCEPTION 'User id and course id are required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.user_has_course_access(p_user_id, p_course_id) THEN
    RAISE EXCEPTION 'Course access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    record_row.attendance_date AS date,
    COUNT(*) FILTER (WHERE record_row.status = 'presente')::BIGINT AS presente,
    COUNT(*) FILTER (WHERE record_row.status = 'ausente')::BIGINT AS ausente,
    COUNT(*) FILTER (WHERE record_row.status = 'justificado')::BIGINT AS justificado,
    COUNT(*)::BIGINT AS total
  FROM public.attendance_records record_row
  WHERE record_row.user_id = p_user_id
    AND record_row.course_id = p_course_id
  GROUP BY record_row.attendance_date
  ORDER BY record_row.attendance_date DESC;
END;
$$;

-- Manual visibility is stored separately from Moodle/gradebook-derived state.
-- A trigger reapplies the explicit choice on every sync upsert, so a later
-- synchronization cannot silently undo the user's command.
CREATE TABLE IF NOT EXISTS public.course_activity_visibility_overrides (
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  moodle_activity_id TEXT NOT NULL,
  hidden BOOLEAN NOT NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, moodle_activity_id),
  CONSTRAINT course_activity_visibility_moodle_id_not_blank
    CHECK (length(trim(moodle_activity_id)) > 0)
);

ALTER TABLE public.course_activity_visibility_overrides ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_course_activity_visibility_overrides_updated_at
  ON public.course_activity_visibility_overrides;
CREATE TRIGGER update_course_activity_visibility_overrides_updated_at
  BEFORE UPDATE ON public.course_activity_visibility_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.apply_course_activity_visibility_override()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hidden BOOLEAN;
BEGIN
  SELECT override_row.hidden
  INTO v_hidden
  FROM public.course_activity_visibility_overrides override_row
  WHERE override_row.course_id = NEW.course_id
    AND override_row.moodle_activity_id = NEW.moodle_activity_id;

  IF FOUND THEN
    NEW.hidden := v_hidden;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_course_activity_visibility_override
  ON public.student_activities;
CREATE TRIGGER apply_course_activity_visibility_override
  BEFORE INSERT OR UPDATE OF course_id, moodle_activity_id, hidden
  ON public.student_activities
  FOR EACH ROW EXECUTE FUNCTION public.apply_course_activity_visibility_override();

CREATE OR REPLACE FUNCTION public.backend_set_course_activity_visibility(
  p_user_id UUID,
  p_course_id UUID,
  p_moodle_activity_id TEXT,
  p_hidden BOOLEAN
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  IF p_user_id IS NULL
    OR p_course_id IS NULL
    OR p_hidden IS NULL
    OR length(trim(COALESCE(p_moodle_activity_id, ''))) = 0 THEN
    RAISE EXCEPTION 'Invalid visibility command' USING ERRCODE = '22023';
  END IF;

  IF NOT public.user_has_course_access(p_user_id, p_course_id) THEN
    RAISE EXCEPTION 'Course access denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.student_activities activity_row
    WHERE activity_row.course_id = p_course_id
      AND activity_row.moodle_activity_id = p_moodle_activity_id
      AND activity_row.activity_type IS DISTINCT FROM 'scorm'
  ) THEN
    RAISE EXCEPTION 'Course activity not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.course_activity_visibility_overrides (
    course_id,
    moodle_activity_id,
    hidden,
    updated_by
  )
  VALUES (
    p_course_id,
    p_moodle_activity_id,
    p_hidden,
    p_user_id
  )
  ON CONFLICT (course_id, moodle_activity_id) DO UPDATE
  SET
    hidden = EXCLUDED.hidden,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  UPDATE public.student_activities
  SET hidden = p_hidden
  WHERE course_id = p_course_id
    AND moodle_activity_id = p_moodle_activity_id
    AND activity_type IS DISTINCT FROM 'scorm';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_save_attendance_sheet(
  p_user_id UUID,
  p_course_id UUID,
  p_attendance_date DATE,
  p_entries JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_entry_count INTEGER;
BEGIN
  IF p_user_id IS NULL
    OR p_course_id IS NULL
    OR p_attendance_date IS NULL
    OR jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'Invalid attendance sheet' USING ERRCODE = '22023';
  END IF;

  IF NOT public.user_has_course_access(p_user_id, p_course_id) THEN
    RAISE EXCEPTION 'Course access denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.attendance_course_settings setting_row
    WHERE setting_row.user_id = p_user_id
      AND setting_row.course_id = p_course_id
  ) THEN
    RAISE EXCEPTION 'Attendance is disabled for this course' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)
  INTO v_entry_count
  FROM jsonb_to_recordset(p_entries) AS entry_row(
    student_id UUID,
    status TEXT,
    notes TEXT
  );

  IF v_entry_count = 0 OR v_entry_count > 500 THEN
    RAISE EXCEPTION 'Attendance entry count is invalid' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_entries) AS entry_row(
      student_id UUID,
      status TEXT,
      notes TEXT
    )
    WHERE entry_row.student_id IS NULL
      OR entry_row.status NOT IN ('presente', 'ausente', 'justificado')
      OR length(COALESCE(entry_row.notes, '')) > 500
  ) THEN
    RAISE EXCEPTION 'Attendance entry is invalid' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT entry_row.student_id)
    FROM jsonb_to_recordset(p_entries) AS entry_row(
      student_id UUID,
      status TEXT,
      notes TEXT
    )
  ) <> v_entry_count THEN
    RAISE EXCEPTION 'Duplicate student in attendance sheet' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_entries) AS entry_row(
      student_id UUID,
      status TEXT,
      notes TEXT
    )
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.student_courses enrollment_row
      WHERE enrollment_row.course_id = p_course_id
        AND enrollment_row.student_id = entry_row.student_id
    )
  ) THEN
    RAISE EXCEPTION 'Student does not belong to the course' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.attendance_records (
    user_id,
    course_id,
    student_id,
    attendance_date,
    status,
    notes
  )
  SELECT
    p_user_id,
    p_course_id,
    entry_row.student_id,
    p_attendance_date,
    entry_row.status,
    NULLIF(entry_row.notes, '')
  FROM jsonb_to_recordset(p_entries) AS entry_row(
    student_id UUID,
    status TEXT,
    notes TEXT
  )
  ON CONFLICT (user_id, course_id, student_id, attendance_date) DO UPDATE
  SET
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    updated_at = now();

  RETURN v_entry_count;
END;
$$;

REVOKE ALL ON FUNCTION public.backend_set_user_course_roles(UUID, UUID[], TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backend_set_user_course_roles(UUID, UUID[], TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.backend_set_user_course_roles(UUID, UUID[], TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.backend_set_user_course_roles(UUID, UUID[], TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.backend_replace_user_course_eligibility(UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backend_replace_user_course_eligibility(UUID, UUID[]) FROM anon;
REVOKE ALL ON FUNCTION public.backend_replace_user_course_eligibility(UUID, UUID[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.backend_replace_user_course_eligibility(UUID, UUID[]) TO service_role;

REVOKE ALL ON FUNCTION public.backend_link_eligible_user_courses(UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backend_link_eligible_user_courses(UUID, UUID[]) FROM anon;
REVOKE ALL ON FUNCTION public.backend_link_eligible_user_courses(UUID, UUID[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.backend_link_eligible_user_courses(UUID, UUID[]) TO service_role;

REVOKE ALL ON FUNCTION public.backend_set_user_courses_ignored(UUID, UUID[], BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backend_set_user_courses_ignored(UUID, UUID[], BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.backend_set_user_courses_ignored(UUID, UUID[], BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.backend_set_user_courses_ignored(UUID, UUID[], BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.backend_set_course_attendance_enabled(UUID, UUID[], BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backend_set_course_attendance_enabled(UUID, UUID[], BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.backend_set_course_attendance_enabled(UUID, UUID[], BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.backend_set_course_attendance_enabled(UUID, UUID[], BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.backend_set_course_activity_visibility(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backend_set_course_activity_visibility(UUID, UUID, TEXT, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.backend_set_course_activity_visibility(UUID, UUID, TEXT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.backend_set_course_activity_visibility(UUID, UUID, TEXT, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.backend_save_attendance_sheet(UUID, UUID, DATE, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backend_save_attendance_sheet(UUID, UUID, DATE, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.backend_save_attendance_sheet(UUID, UUID, DATE, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.backend_save_attendance_sheet(UUID, UUID, DATE, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.backend_get_attendance_date_summaries(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backend_get_attendance_date_summaries(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.backend_get_attendance_date_summaries(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.backend_get_attendance_date_summaries(UUID, UUID) TO service_role;

REVOKE ALL ON TABLE public.course_activity_visibility_overrides FROM PUBLIC;
REVOKE ALL ON TABLE public.course_activity_visibility_overrides FROM anon;
REVOKE ALL ON TABLE public.course_activity_visibility_overrides FROM authenticated;
GRANT ALL ON TABLE public.course_activity_visibility_overrides TO service_role;

REVOKE ALL ON TABLE public.user_course_catalog_eligibility FROM PUBLIC;
REVOKE ALL ON TABLE public.user_course_catalog_eligibility FROM anon;
REVOKE ALL ON TABLE public.user_course_catalog_eligibility FROM authenticated;
GRANT ALL ON TABLE public.user_course_catalog_eligibility TO service_role;

-- Once the browser clients are migrated, every command goes through the
-- validated backend use cases above. Keep only RLS-protected reads while other
-- legacy slices still consume these tables; explicitly remove privileges such
-- as TRUNCATE, REFERENCES and TRIGGER as well as DML writes.
REVOKE ALL ON TABLE
  public.student_activities,
  public.attendance_records,
  public.attendance_course_settings,
  public.user_courses,
  public.user_ignored_courses
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.student_activities,
  public.attendance_records,
  public.attendance_course_settings,
  public.user_courses,
  public.user_ignored_courses
TO anon, authenticated;
