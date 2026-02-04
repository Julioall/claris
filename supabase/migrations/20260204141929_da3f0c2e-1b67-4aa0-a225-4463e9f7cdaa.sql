-- Function to calculate student risk level based on activities, grades and last access
CREATE OR REPLACE FUNCTION public.calculate_student_risk(p_student_id uuid)
RETURNS TABLE(risk_level risk_level, risk_reasons text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    -- Count overdue activities (due_date passed, not completed)
    SELECT COUNT(*) INTO v_overdue_count
    FROM student_activities sa
    WHERE sa.student_id = p_student_id
      AND sa.due_date IS NOT NULL
      AND sa.due_date < now()
      AND sa.completed_at IS NULL;

    -- Get average grade percentage
    SELECT COALESCE(AVG(sa.percentage), 100), COUNT(*) INTO v_avg_percentage, v_total_activities
    FROM student_activities sa
    WHERE sa.student_id = p_student_id
      AND sa.percentage IS NOT NULL;

    -- Count activities with low grades (below 60%)
    SELECT COUNT(*) INTO v_low_grade_count
    FROM student_activities sa
    WHERE sa.student_id = p_student_id
      AND sa.percentage IS NOT NULL
      AND sa.percentage < 60;

    -- Get last access
    SELECT s.last_access INTO v_last_access
    FROM students s
    WHERE s.id = p_student_id;

    -- Calculate days since last access
    IF v_last_access IS NOT NULL THEN
        v_days_since_access := EXTRACT(DAY FROM (now() - v_last_access));
    ELSE
        v_days_since_access := 999; -- Never accessed
    END IF;

    -- Determine risk level based on criteria
    -- CRITICAL: Many overdue activities OR very low grades OR no access for 30+ days
    IF v_overdue_count >= 5 OR v_avg_percentage < 40 OR v_days_since_access >= 30 THEN
        v_risk_level := 'critico';
    -- RISK: Some overdue activities OR low grades OR no access for 14-30 days
    ELSIF v_overdue_count >= 3 OR v_avg_percentage < 60 OR v_days_since_access >= 14 THEN
        v_risk_level := 'risco';
    -- ATTENTION: Few overdue activities OR moderate grades OR no access for 7-14 days
    ELSIF v_overdue_count >= 1 OR v_avg_percentage < 70 OR v_days_since_access >= 7 THEN
        v_risk_level := 'atencao';
    ELSE
        v_risk_level := 'normal';
    END IF;

    -- Build risk reasons array
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

-- Function to update student risk after activities sync
CREATE OR REPLACE FUNCTION public.update_student_risk(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result record;
BEGIN
    SELECT * INTO v_result FROM public.calculate_student_risk(p_student_id);
    
    UPDATE students
    SET 
        current_risk_level = v_result.risk_level,
        risk_reasons = v_result.risk_reasons,
        updated_at = now()
    WHERE id = p_student_id;
END;
$$;

-- Function to update risk for all students in a course
CREATE OR REPLACE FUNCTION public.update_course_students_risk(p_course_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer := 0;
    v_student_id uuid;
BEGIN
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