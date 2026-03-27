CREATE TABLE IF NOT EXISTS public.user_moodle_reauth_credentials (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  moodle_username TEXT NOT NULL,
  moodle_url TEXT NOT NULL,
  moodle_service TEXT NOT NULL DEFAULT 'moodle_mobile_app',
  credential_ciphertext TEXT,
  reauth_enabled BOOLEAN NOT NULL DEFAULT false,
  last_reauth_at TIMESTAMPTZ,
  last_token_issued_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_moodle_reauth_enabled
  ON public.user_moodle_reauth_credentials(reauth_enabled)
  WHERE reauth_enabled = true;

ALTER TABLE public.user_moodle_reauth_credentials ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_user_moodle_reauth_credentials_updated_at ON public.user_moodle_reauth_credentials;
CREATE TRIGGER update_user_moodle_reauth_credentials_updated_at
  BEFORE UPDATE ON public.user_moodle_reauth_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "user_moodle_reauth_credentials_select_owner_or_admin"
ON public.user_moodle_reauth_credentials
FOR SELECT
USING (user_id = auth.uid() OR public.is_application_admin());

GRANT SELECT ON public.user_moodle_reauth_credentials TO authenticated;

COMMENT ON TABLE public.user_moodle_reauth_credentials IS
  'Encrypted Moodle reauthorization material used by background jobs that need to obtain a fresh Moodle token without the browser session.';

COMMENT ON COLUMN public.user_moodle_reauth_credentials.credential_ciphertext IS
  'Ciphertext produced server-side with MOODLE_REAUTH_SECRET. Stores the reauthorization secret material, never plain credentials.';

COMMENT ON COLUMN public.user_moodle_reauth_credentials.reauth_enabled IS
  'Explicit user opt-in for automatic server-side Moodle reauthorization on background jobs.';
