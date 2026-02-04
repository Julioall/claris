-- Update the calculate_student_risk function to exclude hidden activities
CREATE OR REPLACE FUNCTION public.calculate_student_risk(p_student_id uuid)
 RETURNS TABLE(risk_level risk_level, risk_reasons text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Count overdue activities (due_date passed, not completed) - EXCLUDE HIDDEN
    SELECT COUNT(*) INTO v_overdue_count
    FROM student_activities sa
    WHERE sa.student_id = p_student_id
      AND sa.due_date IS NOT NULL
      AND sa.due_date < now()
      AND sa.completed_at IS NULL
      AND (sa.hidden IS NULL OR sa.hidden = false);

    -- Get average grade percentage - EXCLUDE HIDDEN
    SELECT COALESCE(AVG(sa.percentage), 100), COUNT(*) INTO v_avg_percentage, v_total_activities
    FROM student_activities sa
    WHERE sa.student_id = p_student_id
      AND sa.percentage IS NOT NULL
      AND (sa.hidden IS NULL OR sa.hidden = false);

    -- Count activities with low grades (below 60%) - EXCLUDE HIDDEN
    SELECT COUNT(*) INTO v_low_grade_count
    FROM student_activities sa
    WHERE sa.student_id = p_student_id
      AND sa.percentage IS NOT NULL
      AND sa.percentage < 60
      AND (sa.hidden IS NULL OR sa.hidden = false);

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
$function$;