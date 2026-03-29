ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS mobile_phone TEXT;

DROP FUNCTION IF EXISTS public.list_students_paginated(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.list_students_paginated(
  p_course_id UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_risk_filter TEXT DEFAULT NULL,
  p_status_filter TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  moodle_user_id TEXT,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  phone_number TEXT,
  mobile_phone TEXT,
  avatar_url TEXT,
  current_risk_level TEXT,
  risk_reasons TEXT[],
  tags TEXT[],
  last_access TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  enrollment_status TEXT,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH normalized AS (
    SELECT
      NULLIF(btrim(COALESCE(p_search, '')), '') AS search_term,
      NULLIF(lower(btrim(COALESCE(p_risk_filter, ''))), '') AS risk_filter,
      NULLIF(lower(btrim(COALESCE(p_status_filter, ''))), '') AS status_filter,
      LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100) AS page_limit,
      GREATEST(COALESCE(p_offset, 0), 0) AS page_offset
  ),
  accessible_courses AS (
    SELECT course_id
    FROM public.list_accessible_course_ids(auth.uid(), 'tutor')
  ),
  filtered_courses AS (
    SELECT ac.course_id
    FROM accessible_courses ac
    WHERE p_course_id IS NULL OR ac.course_id = p_course_id
  ),
  student_course_rows AS (
    SELECT
      s.id,
      s.moodle_user_id,
      s.full_name,
      s.email,
      s.phone,
      s.phone_number,
      s.mobile_phone,
      s.avatar_url,
      s.current_risk_level,
      s.risk_reasons,
      s.tags,
      s.last_access,
      s.created_at,
      s.updated_at,
      CASE
        WHEN lower(trim(COALESCE(sc.enrollment_status, ''))) IN ('ativo', 'active') THEN 'ativo'
        WHEN lower(trim(COALESCE(sc.enrollment_status, ''))) IN ('suspenso', 'suspended') THEN 'suspenso'
        WHEN lower(trim(COALESCE(sc.enrollment_status, ''))) IN ('concluido', 'completed') THEN 'concluido'
        WHEN lower(trim(COALESCE(sc.enrollment_status, ''))) IN ('inativo', 'inactive', 'nao atualmente', 'not current', 'not_current', 'notcurrently') THEN 'inativo'
        ELSE 'ativo'
      END AS normalized_status,
      (c.start_date IS NULL OR c.start_date <= now()) AS is_valid_course
    FROM public.student_courses sc
    JOIN filtered_courses fc ON fc.course_id = sc.course_id
    JOIN public.students s ON s.id = sc.student_id
    LEFT JOIN public.courses c ON c.id = sc.course_id
  ),
  aggregated AS (
    SELECT
      scr.id,
      scr.moodle_user_id,
      scr.full_name,
      scr.email,
      scr.phone,
      scr.phone_number,
      scr.mobile_phone,
      scr.avatar_url,
      scr.current_risk_level,
      scr.risk_reasons,
      scr.tags,
      scr.last_access,
      scr.created_at,
      scr.updated_at,
      COUNT(*) FILTER (WHERE scr.is_valid_course) AS valid_course_count,
      BOOL_OR(scr.normalized_status = 'ativo') AS any_ativo,
      BOOL_OR(scr.normalized_status = 'suspenso') AS any_suspenso,
      BOOL_OR(scr.normalized_status = 'concluido') AS any_concluido,
      BOOL_OR(scr.normalized_status = 'ativo') FILTER (WHERE scr.is_valid_course) AS valid_ativo,
      BOOL_OR(scr.normalized_status = 'suspenso') FILTER (WHERE scr.is_valid_course) AS valid_suspenso,
      BOOL_OR(scr.normalized_status = 'concluido') FILTER (WHERE scr.is_valid_course) AS valid_concluido
    FROM student_course_rows scr
    GROUP BY
      scr.id,
      scr.moodle_user_id,
      scr.full_name,
      scr.email,
      scr.phone,
      scr.phone_number,
      scr.mobile_phone,
      scr.avatar_url,
      scr.current_risk_level,
      scr.risk_reasons,
      scr.tags,
      scr.last_access,
      scr.created_at,
      scr.updated_at
  ),
  resolved AS (
    SELECT
      a.id,
      a.moodle_user_id,
      a.full_name,
      a.email,
      a.phone,
      a.phone_number,
      a.mobile_phone,
      a.avatar_url,
      a.current_risk_level,
      a.risk_reasons,
      a.tags,
      a.last_access,
      a.created_at,
      a.updated_at,
      CASE
        WHEN a.valid_course_count > 0 THEN
          CASE
            WHEN a.valid_ativo THEN 'ativo'
            WHEN a.valid_suspenso THEN 'suspenso'
            WHEN a.valid_concluido THEN 'concluido'
            ELSE 'inativo'
          END
        ELSE
          CASE
            WHEN a.any_ativo THEN 'ativo'
            WHEN a.any_suspenso THEN 'suspenso'
            WHEN a.any_concluido THEN 'concluido'
            ELSE 'inativo'
          END
      END AS enrollment_status
    FROM aggregated a
  ),
  matched AS (
    SELECT r.*
    FROM resolved r
    CROSS JOIN normalized n
    WHERE
      (n.search_term IS NULL OR r.full_name ILIKE ('%' || n.search_term || '%') OR COALESCE(r.email, '') ILIKE ('%' || n.search_term || '%'))
      AND (n.risk_filter IS NULL OR n.risk_filter = 'all' OR lower(r.current_risk_level::text) = n.risk_filter)
      AND (n.status_filter IS NULL OR n.status_filter = 'all' OR lower(r.enrollment_status) = n.status_filter)
  )
  SELECT
    m.id,
    m.moodle_user_id,
    m.full_name,
    m.email,
    m.phone,
    m.phone_number,
    m.mobile_phone,
    m.avatar_url,
    m.current_risk_level,
    m.risk_reasons,
    m.tags,
    m.last_access,
    m.created_at,
    m.updated_at,
    m.enrollment_status,
    COUNT(*) OVER() AS total_count
  FROM matched m
  ORDER BY
    CASE m.current_risk_level
      WHEN 'critico' THEN 0
      WHEN 'risco' THEN 1
      WHEN 'atencao' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'inativo' THEN 4
      ELSE 5
    END,
    m.full_name
  LIMIT (SELECT page_limit FROM normalized)
  OFFSET (SELECT page_offset FROM normalized);
$$;
