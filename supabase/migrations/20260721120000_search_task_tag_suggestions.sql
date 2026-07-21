CREATE OR REPLACE FUNCTION public.search_task_tag_suggestions(
  p_user_id UUID,
  p_prefix TEXT,
  p_query TEXT DEFAULT '',
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (entity_id TEXT, label TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 10);
  v_pattern TEXT := '%' || COALESCE(p_query, '') || '%';
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF p_prefix = 'aluno' THEN
    RETURN QUERY
    SELECT s.id::TEXT, s.full_name::TEXT
    FROM public.students s
    WHERE s.full_name ILIKE v_pattern
      AND EXISTS (
        SELECT 1
        FROM public.student_courses sc
        JOIN public.list_accessible_course_ids(p_user_id, NULL) accessible
          ON accessible.course_id = sc.course_id
        WHERE sc.student_id = s.id
      )
    ORDER BY s.full_name, s.id
    LIMIT v_limit;
    RETURN;
  END IF;

  IF p_prefix IN ('uc', 'turma') THEN
    RETURN QUERY
    SELECT c.id::TEXT, COALESCE(NULLIF(c.short_name, ''), c.name)::TEXT
    FROM public.courses c
    JOIN public.list_accessible_course_ids(p_user_id, NULL) accessible
      ON accessible.course_id = c.id
    WHERE c.name ILIKE v_pattern
    ORDER BY c.name, c.id
    LIMIT v_limit;
    RETURN;
  END IF;

  IF p_prefix IN ('curso', 'escola') THEN
    RETURN QUERY
    WITH scoped_names AS (
      SELECT DISTINCT
        CASE
          WHEN p_prefix = 'escola' THEN BTRIM(SPLIT_PART(c.category, ' > ', 2))
          ELSE BTRIM(SPLIT_PART(c.category, ' > ', 3))
        END AS name
      FROM public.courses c
      JOIN public.list_accessible_course_ids(p_user_id, NULL) accessible
        ON accessible.course_id = c.id
      WHERE c.category IS NOT NULL
    )
    SELECT scoped_names.name, scoped_names.name
    FROM scoped_names
    WHERE scoped_names.name <> ''
      AND scoped_names.name ILIKE v_pattern
    ORDER BY scoped_names.name
    LIMIT v_limit;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Invalid task tag prefix' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.search_task_tag_suggestions(UUID, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_task_tag_suggestions(UUID, TEXT, TEXT, INTEGER)
  TO service_role;
