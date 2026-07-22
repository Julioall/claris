-- Greenfield Claris account invitations. Authentication links and tokens remain
-- managed by Supabase Auth and are never persisted in public tables.

CREATE TABLE public.claris_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized TEXT NOT NULL,
  full_name TEXT NOT NULL,
  app_role TEXT NOT NULL DEFAULT 'tutor',
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (email_normalized = lower(btrim(email_normalized))),
  CHECK (email_normalized ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CHECK (btrim(full_name) <> ''),
  CHECK (app_role IN ('tutor')),
  CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  CHECK ((status = 'accepted') = (accepted_at IS NOT NULL)),
  CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX claris_invitations_pending_email_key
  ON public.claris_invitations (email_normalized)
  WHERE status = 'pending';

CREATE INDEX claris_invitations_status_expires_idx
  ON public.claris_invitations (status, expires_at);

CREATE TRIGGER update_claris_invitations_updated_at
  BEFORE UPDATE ON public.claris_invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.claris_invitations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.claris_invitations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.claris_invitations TO service_role;

COMMENT ON TABLE public.claris_invitations IS
  'Service-only lifecycle for closed Claris account invitations. No authentication token is stored here.';
