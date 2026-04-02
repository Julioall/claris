-- Migration: Epic 4 - RPC para catálogo de cursos com estatísticas (elimina N+1)
-- Substitui 4 queries base + 2 queries por curso por uma única RPC com JOINs

CREATE OR REPLACE FUNCTION public.get_user_courses_catalog_with_stats(p_user_id UUID)
RETURNS TABLE (
  id              UUID,
  moodle_course_id TEXT,
  name            TEXT,
  short_name      TEXT,
  category        TEXT,
  start_date      TIMESTAMPTZ,
  end_date        TIMESTAMPTZ,
  last_sync       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ,
  student_count   BIGINT,
  at_risk_count   BIGINT,
  is_following    BOOLEAN,
  is_ignored      BOOLEAN,
  is_attendance_enabled BOOLEAN,
  student_ids     UUID[]
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    c.id,
    c.moodle_course_id,
    c.name,
    c.short_name,
    c.category,
    c.start_date,
    c.end_date,
    c.last_sync,
    c.created_at,
    c.updated_at,
    COUNT(DISTINCT sc.student_id)::BIGINT                                AS student_count,
    COUNT(DISTINCT CASE
      WHEN s.current_risk_level IN ('risco', 'critico')
        AND (c.start_date IS NULL OR c.start_date <= NOW())
        AND (c.end_date   IS NULL OR c.end_date   >= NOW())
      THEN sc.student_id
    END)::BIGINT                                                          AS at_risk_count,
    COALESCE(uc.role = 'tutor', false)                                   AS is_following,
    (uic.course_id IS NOT NULL)                                          AS is_ignored,
    (acs.course_id IS NOT NULL)                                          AS is_attendance_enabled,
    COALESCE(
      ARRAY_AGG(DISTINCT sc.student_id) FILTER (WHERE sc.student_id IS NOT NULL),
      '{}'::UUID[]
    )                                                                     AS student_ids
  FROM public.courses c
  -- associação do usuário (role = 'tutor' → is_following)
  LEFT JOIN public.user_courses uc
         ON uc.course_id = c.id
        AND uc.user_id   = p_user_id
  -- cursos ignorados pelo usuário
  LEFT JOIN public.user_ignored_courses uic
         ON uic.course_id = c.id
        AND uic.user_id   = p_user_id
  -- configuração de frequência por curso
  LEFT JOIN public.attendance_course_settings acs
         ON acs.course_id = c.id
        AND acs.user_id   = p_user_id
  -- matrículas de estudantes no curso
  LEFT JOIN public.student_courses sc
         ON sc.course_id = c.id
  -- risco atual de cada estudante
  LEFT JOIN public.students s
         ON s.id = sc.student_id
  GROUP BY
    c.id,
    c.moodle_course_id,
    c.name,
    c.short_name,
    c.category,
    c.start_date,
    c.end_date,
    c.last_sync,
    c.created_at,
    c.updated_at,
    uc.role,
    uic.course_id,
    acs.course_id
  ORDER BY c.name
$$;

GRANT EXECUTE ON FUNCTION public.get_user_courses_catalog_with_stats(UUID) TO authenticated;
