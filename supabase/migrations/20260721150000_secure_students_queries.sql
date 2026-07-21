-- Student reads are exposed through the authenticated `students` Edge Function.
-- This RPC accepts the token-derived user id from that trusted backend and keeps
-- the current "followed as tutor" list semantics while returning a stable page.

CREATE OR REPLACE FUNCTION public.backend_list_students_page(
  p_user_id UUID,
  p_course_id UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_risk_filter TEXT DEFAULT NULL,
  p_status_filter TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 100' USING ERRCODE = '22023';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'p_offset must be non-negative' USING ERRCODE = '22023';
  END IF;

  WITH normalized AS (
    SELECT
      NULLIF(btrim(COALESCE(p_search, '')), '') AS search_term,
      NULLIF(lower(btrim(COALESCE(p_risk_filter, ''))), '') AS risk_filter,
      NULLIF(lower(btrim(COALESCE(p_status_filter, ''))), '') AS status_filter
  ),
  followed_courses AS (
    SELECT uc.course_id
    FROM public.user_courses uc
    WHERE uc.user_id = p_user_id
      AND uc.role = 'tutor'
  ),
  filtered_courses AS (
    SELECT fc.course_id
    FROM followed_courses fc
    WHERE p_course_id IS NULL OR fc.course_id = p_course_id
  ),
  student_course_rows AS (
    SELECT
      s.id,
      s.full_name,
      s.email,
      s.avatar_url,
      s.current_risk_level,
      s.last_access,
      CASE
        WHEN lower(trim(COALESCE(sc.enrollment_status, ''))) IN ('ativo', 'active') THEN 'ativo'
        WHEN lower(trim(COALESCE(sc.enrollment_status, ''))) IN ('suspenso', 'suspended') THEN 'suspenso'
        WHEN lower(trim(COALESCE(sc.enrollment_status, ''))) IN ('concluido', 'completed') THEN 'concluido'
        WHEN lower(trim(COALESCE(sc.enrollment_status, ''))) IN (
          'inativo', 'inactive', 'nao atualmente', 'not current', 'not_current', 'notcurrently'
        ) THEN 'inativo'
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
      scr.full_name,
      scr.email,
      scr.avatar_url,
      scr.current_risk_level,
      scr.last_access,
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
      scr.full_name,
      scr.email,
      scr.avatar_url,
      scr.current_risk_level,
      scr.last_access
  ),
  resolved AS (
    SELECT
      a.id,
      a.full_name,
      a.email,
      a.avatar_url,
      a.current_risk_level,
      a.last_access,
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
    SELECT
      r.*,
      CASE r.current_risk_level
        WHEN 'critico' THEN 0
        WHEN 'risco' THEN 1
        WHEN 'atencao' THEN 2
        WHEN 'normal' THEN 3
        WHEN 'inativo' THEN 4
        ELSE 5
      END AS risk_order
    FROM resolved r
    CROSS JOIN normalized n
    WHERE
      (
        n.search_term IS NULL
        OR r.full_name ILIKE ('%' || n.search_term || '%')
        OR COALESCE(r.email, '') ILIKE ('%' || n.search_term || '%')
      )
      AND (n.risk_filter IS NULL OR lower(r.current_risk_level::TEXT) = n.risk_filter)
      AND (n.status_filter IS NULL OR lower(r.enrollment_status) = n.status_filter)
  ),
  page_rows AS (
    SELECT *
    FROM matched
    ORDER BY risk_order, full_name, id
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', page_row.id,
            'full_name', page_row.full_name,
            'email', page_row.email,
            'avatar_url', page_row.avatar_url,
            'current_risk_level', page_row.current_risk_level,
            'last_access', page_row.last_access,
            'enrollment_status', page_row.enrollment_status
          )
          ORDER BY page_row.risk_order, page_row.full_name, page_row.id
        )
        FROM page_rows page_row
      ),
      '[]'::JSONB
    ),
    'total_count', (SELECT COUNT(*) FROM matched)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.backend_list_students_page(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backend_list_students_page(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER)
  TO service_role;

-- The browser no longer needs the legacy listing function. Keep it temporarily
-- for rollback compatibility, but make it backend-only.
REVOKE ALL ON FUNCTION public.list_students_paginated(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_students_paginated(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER)
  TO service_role;

-- Snapshots are now only read through the scoped backend service.
REVOKE ALL ON TABLE public.student_sync_snapshots FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.student_sync_snapshots TO service_role;
