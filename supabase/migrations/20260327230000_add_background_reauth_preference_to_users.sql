ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS background_reauth_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.users.background_reauth_enabled IS
  'User-level preference that controls whether Moodle credentials should be stored server-side for background job reauthorization on subsequent logins.';
