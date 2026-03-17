-- Feature flags table for admin-managed feature toggles
CREATE TABLE IF NOT EXISTS public.app_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  payload JSONB DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_feature_flags_key
  ON public.app_feature_flags(key);

ALTER TABLE public.app_feature_flags ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_app_feature_flags_updated_at ON public.app_feature_flags;
CREATE TRIGGER update_app_feature_flags_updated_at
  BEFORE UPDATE ON public.app_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- All authenticated users can read feature flags
CREATE POLICY "feature_flags_select"
ON public.app_feature_flags
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only admins can insert/update/delete feature flags
CREATE POLICY "feature_flags_insert"
ON public.app_feature_flags
FOR INSERT
WITH CHECK (public.is_application_admin());

CREATE POLICY "feature_flags_update"
ON public.app_feature_flags
FOR UPDATE
USING (public.is_application_admin())
WITH CHECK (public.is_application_admin());

CREATE POLICY "feature_flags_delete"
ON public.app_feature_flags
FOR DELETE
USING (public.is_application_admin());

GRANT SELECT ON public.app_feature_flags TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.app_feature_flags TO authenticated;
