
-- Fix calculate_student_risk: add access control check
-- Allow service_role to bypass (for edge function calls) but require user access for regular users
CREATE OR REPLACE FUNCTION public.calculate_student_risk(p_student_id uuid)
RETURNS TABLE(risk_level risk_level, risk_reasons text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_risk_level risk_level := 'normal';
    v_risk_reasons text[] := '{}';
    v_overdue_count integer := 0;
    v_avg_percentage numeric := 100;
    v_days_since_access integer := 0;
    v_last_access timestamp with time zone;
    v_total_activities integer := 0;
    v_low_grade_count integer := 0;
BEGIN
    -- Access control: allow service_role or users with student access
    IF auth.role() != 'service_role' AND NOT public.user_has_student_access(auth.uid(), p_student_id) THEN
        RAISE EXCEPTION 'Access denied to student %', p_student_id;
    END IF;

    SELECT COUNT(*) INTO v_overdue_count
    FROM student_activities sa
    WHERE sa.student_id = p_student_id
      AND sa.due_date IS NOT NULL
      AND sa.due_date < now()
      AND sa.completed_at IS NULL
      AND (sa.hidden IS NULL OR sa.hidden = false);

    SELECT COALESCE(AVG(sa.percentage), 100), COUNT(*) INTO v_avg_percentage, v_total_activities
    FROM student_activities sa
    WHERE sa.student_id = p_student_id
      AND sa.percentage IS NOT NULL
      AND (sa.hidden IS NULL OR sa.hidden = false);

    SELECT COUNT(*) INTO v_low_grade_count
    FROM student_activities sa
    WHERE sa.student_id = p_student_id
      AND sa.percentage IS NOT NULL
      AND sa.percentage < 60
      AND (sa.hidden IS NULL OR sa.hidden = false);

    SELECT s.last_access INTO v_last_access
    FROM students s
    WHERE s.id = p_student_id;

    IF v_last_access IS NOT NULL THEN
        v_days_since_access := EXTRACT(DAY FROM (now() - v_last_access));
    ELSE
        v_days_since_access := 999;
    END IF;

    IF v_overdue_count >= 5 OR v_avg_percentage < 40 OR v_days_since_access >= 30 THEN
        v_risk_level := 'critico';
    ELSIF v_overdue_count >= 3 OR v_avg_percentage < 60 OR v_days_since_access >= 14 THEN
        v_risk_level := 'risco';
    ELSIF v_overdue_count >= 1 OR v_avg_percentage < 70 OR v_days_since_access >= 7 THEN
        v_risk_level := 'atencao';
    ELSE
        v_risk_level := 'normal';
    END IF;

    IF v_overdue_count > 0 THEN
        v_risk_reasons := array_append(v_risk_reasons, 'atividades_atrasadas');
    END IF;
    IF v_avg_percentage < 70 AND v_total_activities > 0 THEN
        v_risk_reasons := array_append(v_risk_reasons, 'baixa_nota');
    END IF;
    IF v_days_since_access >= 7 THEN
        v_risk_reasons := array_append(v_risk_reasons, 'sem_acesso_recente');
    END IF;

    RETURN QUERY SELECT v_risk_level, v_risk_reasons;
END;
$$;

-- Fix update_student_risk: add access control check
CREATE OR REPLACE FUNCTION public.update_student_risk(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_result record;
BEGIN
    -- Access control: allow service_role or users with student access
    IF auth.role() != 'service_role' AND NOT public.user_has_student_access(auth.uid(), p_student_id) THEN
        RAISE EXCEPTION 'Access denied to student %', p_student_id;
    END IF;

    SELECT * INTO v_result FROM public.calculate_student_risk(p_student_id);
    
    UPDATE students
    SET 
        current_risk_level = v_result.risk_level,
        risk_reasons = v_result.risk_reasons,
        updated_at = now()
    WHERE id = p_student_id;
END;
$$;

-- Fix update_course_students_risk: add access control check
CREATE OR REPLACE FUNCTION public.update_course_students_risk(p_course_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_count integer := 0;
    v_student_id uuid;
BEGIN
    -- Access control: allow service_role or users with course access
    IF auth.role() != 'service_role' AND NOT public.user_has_course_access(auth.uid(), p_course_id) THEN
        RAISE EXCEPTION 'Access denied to course %', p_course_id;
    END IF;

    FOR v_student_id IN 
        SELECT DISTINCT sc.student_id 
        FROM student_courses sc 
        WHERE sc.course_id = p_course_id
    LOOP
        PERFORM public.update_student_risk(v_student_id);
        v_count := v_count + 1;
    END LOOP;
    
    RETURN v_count;
END;
$$;
