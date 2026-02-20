ALTER TABLE public.user_sync_preferences
  ADD COLUMN IF NOT EXISTS risk_threshold_days JSONB NOT NULL DEFAULT '{"atencao":7,"risco":14,"critico":30}'::jsonb;

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
    v_risk_settings jsonb := '{}'::jsonb;
    v_atencao_days integer := 7;
    v_risco_days integer := 14;
    v_critico_days integer := 30;
BEGIN
    -- Access control: allow service_role or users with student access
    IF auth.role() != 'service_role' AND NOT public.user_has_student_access(auth.uid(), p_student_id) THEN
        RAISE EXCEPTION 'Access denied to student %', p_student_id;
    END IF;

    -- Load user-configured inactivity thresholds (fallback to defaults)
    IF auth.role() != 'service_role' THEN
        SELECT usp.risk_threshold_days
        INTO v_risk_settings
        FROM public.user_sync_preferences usp
        WHERE usp.user_id = auth.uid()
        LIMIT 1;

        IF v_risk_settings IS NOT NULL THEN
            v_atencao_days := GREATEST(1, COALESCE((v_risk_settings->>'atencao')::integer, v_atencao_days));
            v_risco_days := GREATEST(v_atencao_days + 1, COALESCE((v_risk_settings->>'risco')::integer, v_risco_days));
            v_critico_days := GREATEST(v_risco_days + 1, COALESCE((v_risk_settings->>'critico')::integer, v_critico_days));
        END IF;
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

    SELECT s.last_access INTO v_last_access
    FROM students s
    WHERE s.id = p_student_id;

    IF v_last_access IS NOT NULL THEN
        v_days_since_access := EXTRACT(DAY FROM (now() - v_last_access));
    ELSE
        v_days_since_access := 999;
    END IF;

    IF v_overdue_count >= 5 OR v_avg_percentage < 40 OR v_days_since_access >= v_critico_days THEN
        v_risk_level := 'critico';
    ELSIF v_overdue_count >= 3 OR v_avg_percentage < 60 OR v_days_since_access >= v_risco_days THEN
        v_risk_level := 'risco';
    ELSIF v_overdue_count >= 1 OR v_avg_percentage < 70 OR v_days_since_access >= v_atencao_days THEN
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
    IF v_days_since_access >= v_atencao_days THEN
        v_risk_reasons := array_append(v_risk_reasons, 'sem_acesso_recente');
    END IF;

    RETURN QUERY SELECT v_risk_level, v_risk_reasons;
END;
$$;
