CREATE OR REPLACE FUNCTION public.update_student_risk(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_result record;
BEGIN
    IF auth.role() != 'service_role' AND NOT public.user_has_student_access(auth.uid(), p_student_id) THEN
        RAISE EXCEPTION 'Access denied to student %', p_student_id;
    END IF;

    PERFORM 1
    FROM public.students s
    WHERE s.id = p_student_id
    FOR UPDATE;

    SELECT * INTO v_result FROM public.calculate_student_risk(p_student_id);

    UPDATE public.students
    SET
        current_risk_level = v_result.risk_level,
        risk_reasons = v_result.risk_reasons,
        updated_at = now()
    WHERE id = p_student_id
      AND (
        current_risk_level IS DISTINCT FROM v_result.risk_level OR
        risk_reasons IS DISTINCT FROM v_result.risk_reasons
      );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_course_students_risk(p_course_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_count integer := 0;
BEGIN
    IF auth.role() != 'service_role' AND NOT public.user_has_course_access(auth.uid(), p_course_id) THEN
        RAISE EXCEPTION 'Access denied to course %', p_course_id;
    END IF;

    WITH ordered_students AS (
        SELECT DISTINCT sc.student_id
        FROM public.student_courses sc
        WHERE sc.course_id = p_course_id
        ORDER BY sc.student_id
    ),
    locked_students AS (
        SELECT s.id
        FROM public.students s
        JOIN ordered_students os ON os.student_id = s.id
        ORDER BY s.id
        FOR UPDATE
    ),
    computed_risk AS (
        SELECT
            ls.id AS student_id,
            calc.risk_level,
            calc.risk_reasons
        FROM locked_students ls
        CROSS JOIN LATERAL public.calculate_student_risk(ls.id) calc
    )
    UPDATE public.students s
    SET
        current_risk_level = cr.risk_level,
        risk_reasons = cr.risk_reasons,
        updated_at = now()
    FROM computed_risk cr
    WHERE s.id = cr.student_id
      AND (
        s.current_risk_level IS DISTINCT FROM cr.risk_level OR
        s.risk_reasons IS DISTINCT FROM cr.risk_reasons
      );

    SELECT COUNT(*)::integer
    INTO v_count
    FROM (
        SELECT DISTINCT sc.student_id
        FROM public.student_courses sc
        WHERE sc.course_id = p_course_id
    ) AS students_in_course;

    RETURN v_count;
END;
$$;