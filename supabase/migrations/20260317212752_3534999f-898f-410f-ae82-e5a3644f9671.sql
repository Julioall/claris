
-- Fix: INSERT policies only support WITH CHECK, not USING

-- 1. Prevent privilege escalation: block users from changing admin-identifying fields
CREATE OR REPLACE FUNCTION public.prevent_admin_field_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    NEW.moodle_username := OLD.moodle_username;
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_prevent_admin_field_tampering'
  ) THEN
    CREATE TRIGGER tr_prevent_admin_field_tampering
      BEFORE UPDATE ON public.users
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_admin_field_tampering();
  END IF;
END $$;

-- 2. Fix app_settings SELECT: require authentication
DROP POLICY IF EXISTS "app_settings_select" ON public.app_settings;
CREATE POLICY "app_settings_select" ON public.app_settings
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 3. Fix resolve_current_app_user_id: remove moodle_user_id fallback
CREATE OR REPLACE FUNCTION public.resolve_current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT u.id FROM public.users u WHERE u.id = auth.uid() LIMIT 1;
$$;

-- 4. Create admin_user_roles table
CREATE TABLE IF NOT EXISTS public.admin_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user',
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.admin_user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_user_roles_select" ON public.admin_user_roles;
CREATE POLICY "admin_user_roles_select" ON public.admin_user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_application_admin());

DROP POLICY IF EXISTS "admin_user_roles_service_insert" ON public.admin_user_roles;
CREATE POLICY "admin_user_roles_service_insert" ON public.admin_user_roles
  FOR INSERT
  WITH CHECK (current_setting('role', true) = 'service_role');

DROP POLICY IF EXISTS "admin_user_roles_service_update" ON public.admin_user_roles;
CREATE POLICY "admin_user_roles_service_update" ON public.admin_user_roles
  FOR UPDATE
  USING (current_setting('role', true) = 'service_role')
  WITH CHECK (current_setting('role', true) = 'service_role');

DROP POLICY IF EXISTS "admin_user_roles_service_delete" ON public.admin_user_roles;
CREATE POLICY "admin_user_roles_service_delete" ON public.admin_user_roles
  FOR DELETE
  USING (current_setting('role', true) = 'service_role');
