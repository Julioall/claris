-- 20260721270000_add_moodle_sites_and_connections.sql

CREATE TABLE IF NOT EXISTS public.moodle_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT UNIQUE NOT NULL,
  service TEXT NOT NULL DEFAULT 'moodle_mobile_app',
  status TEXT NOT NULL DEFAULT 'pending',
  release TEXT,
  version TEXT,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('pending', 'approved', 'disabled')),
  CHECK (base_url ~ '^https://[a-z0-9.-]+$')
);

CREATE TABLE IF NOT EXISTS public.user_moodle_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  moodle_site_id UUID NOT NULL REFERENCES public.moodle_sites(id) ON DELETE RESTRICT,
  alias TEXT NOT NULL,
  moodle_user_id TEXT NOT NULL,
  moodle_username TEXT,
  moodle_full_name TEXT,
  moodle_email TEXT,
  moodle_avatar_url TEXT,
  credential_ciphertext TEXT,
  reauth_enabled BOOLEAN NOT NULL DEFAULT false,
  can_write BOOLEAN NOT NULL DEFAULT false,
  capabilities JSONB,
  status TEXT NOT NULL DEFAULT 'active',
  last_reauth_at TIMESTAMPTZ,
  last_token_issued_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, moodle_site_id, moodle_user_id),
  UNIQUE (moodle_site_id, moodle_user_id),
  CHECK (status IN ('active', 'reauth_required', 'disconnecting', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS user_moodle_connections_user_alias_key
  ON public.user_moodle_connections (user_id, lower(btrim(alias)));

-- Seed FIEG and SENAI
INSERT INTO public.moodle_sites (id, slug, name, base_url, service, status, release, version)
VALUES 
  ('f7c320d5-1c39-4d69-906d-42289f6b92a4', 'fieg', 'FIEG Moodle', 'https://ead.fieg.com.br', 'moodle_mobile_app', 'approved', '5.1.2 (Build: 20260209)', '2025100602'),
  ('b09deea6-fb9f-4318-b2a6-981881512db4', 'senai', 'SENAI Moodle', 'https://ead.senai.br', 'moodle_mobile_app', 'approved', '4.5.5 (Build: 20250609)', '2024100705')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  service = EXCLUDED.service,
  status = EXCLUDED.status,
  release = EXCLUDED.release,
  version = EXCLUDED.version,
  updated_at = NOW();

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_moodle_sites_updated_at ON public.moodle_sites;
CREATE TRIGGER update_moodle_sites_updated_at
  BEFORE UPDATE ON public.moodle_sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_moodle_connections_updated_at ON public.user_moodle_connections;
CREATE TRIGGER update_user_moodle_connections_updated_at
  BEFORE UPDATE ON public.user_moodle_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Service-only storage. Browser contracts are exposed by authenticated Edge Functions.
ALTER TABLE public.moodle_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_moodle_connections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.moodle_sites FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_moodle_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.moodle_sites TO service_role;
GRANT ALL ON TABLE public.user_moodle_connections TO service_role;
