-- Usage events tracking table
CREATE TABLE IF NOT EXISTS public.app_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  route TEXT,
  resource TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_usage_events_user_created
  ON public.app_usage_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_usage_events_type_created
  ON public.app_usage_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_usage_events_created
  ON public.app_usage_events(created_at DESC);

ALTER TABLE public.app_usage_events ENABLE ROW LEVEL SECURITY;

-- Users can insert their own events
CREATE POLICY "app_usage_events_insert"
ON public.app_usage_events
FOR INSERT
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Only admins can read all events
CREATE POLICY "app_usage_events_select"
ON public.app_usage_events
FOR SELECT
USING (public.is_application_admin());

GRANT SELECT, INSERT ON public.app_usage_events TO authenticated;
