-- Admin RBAC: roles and permissions table
CREATE TABLE IF NOT EXISTS public.admin_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin',
  permissions JSONB NOT NULL DEFAULT '["admin"]'::jsonb,
  granted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_user_roles_role_check CHECK (role IN ('admin', 'support', 'analyst')),
  UNIQUE (user_id)
);

ALTER TABLE public.admin_user_roles ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_admin_user_roles_updated_at ON public.admin_user_roles;
CREATE TRIGGER update_admin_user_roles_updated_at
  BEFORE UPDATE ON public.admin_user_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Only authenticated users can see admin roles (admins see all, others see own)
CREATE POLICY "admin_user_roles_select"
ON public.admin_user_roles
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_application_admin()
);

-- Only admins can insert/update/delete roles
CREATE POLICY "admin_user_roles_insert"
ON public.admin_user_roles
FOR INSERT
WITH CHECK (public.is_application_admin());

CREATE POLICY "admin_user_roles_update"
ON public.admin_user_roles
FOR UPDATE
USING (public.is_application_admin())
WITH CHECK (public.is_application_admin());

CREATE POLICY "admin_user_roles_delete"
ON public.admin_user_roles
FOR DELETE
USING (public.is_application_admin());

GRANT SELECT ON public.admin_user_roles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.admin_user_roles TO authenticated;

-- Update is_application_admin() to check the RBAC table first, then fall back to hardcoded check
CREATE OR REPLACE FUNCTION public.is_application_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_user_roles aur
    WHERE aur.user_id = auth.uid()
      AND aur.role = 'admin'
  )
  OR
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND (
        u.moodle_username = '04112637225'
        OR lower(COALESCE(u.email, '')) = 'julioalves@fieg.com.br'
      )
  );
$$;

-- Seed admin role for the hardcoded admin user if they exist
DO $$
DECLARE
  v_admin_user_id UUID;
BEGIN
  SELECT u.id INTO v_admin_user_id
  FROM public.users u
  WHERE u.moodle_username = '04112637225'
     OR lower(COALESCE(u.email, '')) = 'julioalves@fieg.com.br'
  LIMIT 1;

  IF v_admin_user_id IS NOT NULL THEN
    INSERT INTO public.admin_user_roles (user_id, role, permissions)
    VALUES (v_admin_user_id, 'admin', '["admin","support","analyst"]'::jsonb)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;
