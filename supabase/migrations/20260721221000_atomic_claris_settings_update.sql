CREATE OR REPLACE FUNCTION public.backend_update_claris_llm_settings(
  p_provider TEXT,
  p_model TEXT,
  p_base_url TEXT,
  p_custom_instructions TEXT,
  p_api_key TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_api_key TEXT;
  v_provider TEXT := lower(btrim(COALESCE(p_provider, '')));
  v_model TEXT := btrim(COALESCE(p_model, ''));
  v_base_url TEXT := regexp_replace(btrim(COALESCE(p_base_url, '')), '/+$', '');
BEGIN
  INSERT INTO public.app_settings (singleton_id)
  VALUES ('global')
  ON CONFLICT (singleton_id) DO NOTHING;

  SELECT COALESCE(
    NULLIF(btrim(COALESCE(p_api_key, '')), ''),
    NULLIF(btrim(COALESCE(settings.claris_llm_settings ->> 'apiKey', '')), ''),
    ''
  )
  INTO v_api_key
  FROM public.app_settings settings
  WHERE settings.singleton_id = 'global'
  FOR UPDATE;

  UPDATE public.app_settings
  SET claris_llm_settings = jsonb_build_object(
    'provider', v_provider,
    'model', v_model,
    'baseUrl', v_base_url,
    'apiKey', v_api_key,
    'customInstructions', btrim(COALESCE(p_custom_instructions, '')),
    'configured', (
      v_provider <> ''
      AND v_model <> ''
      AND v_base_url <> ''
      AND v_api_key <> ''
    ),
    'updatedAt', to_jsonb(now() AT TIME ZONE 'UTC')
  )
  WHERE singleton_id = 'global';
END;
$$;

REVOKE ALL ON FUNCTION public.backend_update_claris_llm_settings(TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backend_update_claris_llm_settings(TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.backend_update_claris_llm_settings(TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Atualiza configuracao LLM atomicamente e preserva a chave armazenada quando o backend omite uma substituta.';
