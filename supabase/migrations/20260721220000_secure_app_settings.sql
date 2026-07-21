DROP POLICY IF EXISTS "app_settings_select" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_insert_admin" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_update_admin" ON public.app_settings;

REVOKE ALL PRIVILEGES ON TABLE public.app_settings FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.app_settings TO service_role;

COMMENT ON TABLE public.app_settings IS
  'Configuracoes globais acessiveis somente pelo backend app-settings; segredos nunca sao expostos ao frontend.';
