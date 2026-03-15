CREATE OR REPLACE FUNCTION public.calculate_student_risk(p_student_id uuid)
RETURNS TABLE(risk_level risk_level, risk_reasons text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_risk_level risk_level := 'normal';
    v_risk_reasons text[] := '{}';
    v_days_since_access integer := 0;
    v_last_access timestamp with time zone;
    v_has_suspended_valid_course boolean := false;

    v_default_atencao integer := 7;
    v_default_risco integer := 14;
    v_default_critico integer := 30;

    v_atencao_days integer := 7;
    v_risco_days integer := 14;
    v_critico_days integer := 30;

    v_risk_settings jsonb := '{}'::jsonb;
    v_service_atencao integer;
    v_service_risco integer;
    v_service_critico integer;
BEGIN
    IF auth.role() != 'service_role' AND NOT public.user_has_student_access(auth.uid(), p_student_id) THEN
        RAISE EXCEPTION 'Access denied to student %', p_student_id;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.student_courses sc
        JOIN public.courses c ON c.id = sc.course_id
        WHERE sc.student_id = p_student_id
          AND COALESCE(sc.enrollment_status, 'ativo') = 'suspenso'
          AND (c.start_date IS NULL OR c.start_date <= now())
          AND (c.end_date IS NULL OR c.end_date >= now())
    ) INTO v_has_suspended_valid_course;

    IF v_has_suspended_valid_course THEN
        RETURN QUERY SELECT 'inativo'::risk_level, ARRAY['aluno_suspenso']::text[];
        RETURN;
    END IF;

    IF auth.role() = 'service_role' THEN
        SELECT
            MIN(GREATEST(1, COALESCE((usp.risk_threshold_days->>'atencao')::integer, v_default_atencao))),
            MIN(GREATEST(1, COALESCE((usp.risk_threshold_days->>'risco')::integer, v_default_risco))),
            MIN(GREATEST(1, COALESCE((usp.risk_threshold_days->>'critico')::integer, v_default_critico)))
        INTO v_service_atencao, v_service_risco, v_service_critico
        FROM public.user_courses uc
        JOIN public.student_courses sc
          ON sc.course_id = uc.course_id
         AND sc.student_id = p_student_id
        JOIN public.courses c
          ON c.id = sc.course_id
        JOIN public.user_sync_preferences usp
          ON usp.user_id = uc.user_id
        WHERE uc.role = 'tutor'
          AND (c.start_date IS NULL OR c.start_date <= now())
          AND (c.end_date IS NULL OR c.end_date >= now());

        IF v_service_atencao IS NOT NULL THEN
            v_atencao_days := v_service_atencao;
            v_risco_days := COALESCE(v_service_risco, v_default_risco);
            v_critico_days := COALESCE(v_service_critico, v_default_critico);
        END IF;
    ELSE
        SELECT usp.risk_threshold_days
        INTO v_risk_settings
        FROM public.user_sync_preferences usp
        WHERE usp.user_id = auth.uid()::text
        LIMIT 1;

        IF v_risk_settings IS NOT NULL THEN
            v_atencao_days := GREATEST(1, COALESCE((v_risk_settings->>'atencao')::integer, v_default_atencao));
            v_risco_days := GREATEST(1, COALESCE((v_risk_settings->>'risco')::integer, v_default_risco));
            v_critico_days := GREATEST(1, COALESCE((v_risk_settings->>'critico')::integer, v_default_critico));
        END IF;
    END IF;

    v_risco_days := GREATEST(v_atencao_days + 1, v_risco_days);
    v_critico_days := GREATEST(v_risco_days + 1, v_critico_days);

    SELECT s.last_access INTO v_last_access
    FROM public.students s
    WHERE s.id = p_student_id;

    IF v_last_access IS NOT NULL THEN
        v_days_since_access := EXTRACT(DAY FROM (now() - v_last_access));
    ELSE
        v_days_since_access := 999;
    END IF;

    IF v_days_since_access >= v_critico_days THEN
        v_risk_level := 'critico';
    ELSIF v_days_since_access >= v_risco_days THEN
        v_risk_level := 'risco';
    ELSIF v_days_since_access >= v_atencao_days THEN
        v_risk_level := 'atencao';
    ELSE
        v_risk_level := 'normal';
    END IF;

    IF v_days_since_access >= v_atencao_days THEN
        v_risk_reasons := ARRAY['sem_acesso_recente']::text[];
    END IF;

    RETURN QUERY SELECT v_risk_level, v_risk_reasons;
END;
$$;
