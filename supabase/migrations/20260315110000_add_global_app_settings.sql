CREATE TABLE IF NOT EXISTS public.app_settings (
  singleton_id text PRIMARY KEY DEFAULT 'global',
  moodle_connection_url text NOT NULL DEFAULT 'https://ead.fieg.com.br',
  moodle_connection_service text NOT NULL DEFAULT 'moodle_mobile_app',
  risk_threshold_days jsonb NOT NULL DEFAULT '{"atencao":7,"risco":14,"critico":30}'::jsonb,
  claris_llm_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton_check CHECK (singleton_id = 'global')
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_select" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_insert_admin" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_update_admin" ON public.app_settings;

CREATE OR REPLACE FUNCTION public.is_application_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND (
        u.moodle_username = '04112637225'
        OR lower(COALESCE(u.email, '')) = 'julioalves@fieg.com.br'
      )
  );
$$;

CREATE POLICY "app_settings_select"
ON public.app_settings
FOR SELECT
USING (true);

CREATE POLICY "app_settings_insert_admin"
ON public.app_settings
FOR INSERT
WITH CHECK (public.is_application_admin());

CREATE POLICY "app_settings_update_admin"
ON public.app_settings
FOR UPDATE
USING (public.is_application_admin())
WITH CHECK (public.is_application_admin());

GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.app_settings TO authenticated;

DROP TRIGGER IF EXISTS update_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_settings (
  singleton_id,
  moodle_connection_url,
  moodle_connection_service,
  risk_threshold_days,
  claris_llm_settings
)
SELECT
  'global',
  'https://ead.fieg.com.br',
  'moodle_mobile_app',
  COALESCE(
    (
      SELECT usp.risk_threshold_days
      FROM public.user_sync_preferences usp
      JOIN public.users u ON u.id::text = usp.user_id
      WHERE u.moodle_username = '04112637225'
         OR lower(COALESCE(u.email, '')) = 'julioalves@fieg.com.br'
      ORDER BY usp.updated_at DESC
      LIMIT 1
    ),
    '{"atencao":7,"risco":14,"critico":30}'::jsonb
  ),
  COALESCE(
    (
      SELECT usp.claris_llm_settings
      FROM public.user_sync_preferences usp
      JOIN public.users u ON u.id::text = usp.user_id
      WHERE u.moodle_username = '04112637225'
         OR lower(COALESCE(u.email, '')) = 'julioalves@fieg.com.br'
      ORDER BY usp.updated_at DESC
      LIMIT 1
    ),
    '{}'::jsonb
  )
ON CONFLICT (singleton_id) DO NOTHING;

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

    v_risk_settings jsonb := '{"atencao":7,"risco":14,"critico":30}'::jsonb;
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

    SELECT app.risk_threshold_days
    INTO v_risk_settings
    FROM public.app_settings app
    WHERE app.singleton_id = 'global'
    LIMIT 1;

    v_atencao_days := GREATEST(1, COALESCE((v_risk_settings->>'atencao')::integer, v_default_atencao));
    v_risco_days := GREATEST(1, COALESCE((v_risk_settings->>'risco')::integer, v_default_risco));
    v_critico_days := GREATEST(1, COALESCE((v_risk_settings->>'critico')::integer, v_default_critico));

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