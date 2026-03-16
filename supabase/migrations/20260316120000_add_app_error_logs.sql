-- Error logs table
CREATE TABLE IF NOT EXISTS public.app_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'error',
  category TEXT NOT NULL DEFAULT 'ui',
  message TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  context JSONB DEFAULT '{}'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_error_logs_severity_check CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  CONSTRAINT app_error_logs_category_check CHECK (category IN ('ui', 'import', 'integration', 'edge_function', 'ai', 'auth', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_app_error_logs_user_created
  ON public.app_error_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_error_logs_severity_created
  ON public.app_error_logs(severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_error_logs_category_created
  ON public.app_error_logs(category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_error_logs_resolved
  ON public.app_error_logs(resolved, created_at DESC);

ALTER TABLE public.app_error_logs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_app_error_logs_updated_at ON public.app_error_logs;
CREATE TRIGGER update_app_error_logs_updated_at
  BEFORE UPDATE ON public.app_error_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Users can insert errors
CREATE POLICY "app_error_logs_insert"
ON public.app_error_logs
FOR INSERT
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Only admins can read all errors
CREATE POLICY "app_error_logs_select"
ON public.app_error_logs
FOR SELECT
USING (public.is_application_admin());

-- Only admins can update (to resolve)
CREATE POLICY "app_error_logs_update"
ON public.app_error_logs
FOR UPDATE
USING (public.is_application_admin())
WITH CHECK (public.is_application_admin());

GRANT SELECT, INSERT ON public.app_error_logs TO authenticated;
GRANT UPDATE ON public.app_error_logs TO authenticated;
