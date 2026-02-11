ALTER TABLE public.user_sync_preferences
  ADD COLUMN IF NOT EXISTS sync_interval_hours JSONB NOT NULL DEFAULT '{"courses":24,"students":12,"activities":2.4,"grades":2.4}'::jsonb;

UPDATE public.user_sync_preferences
SET sync_interval_hours = jsonb_build_object(
  'courses', COALESCE((sync_interval_days->>'courses')::numeric * 24, 24),
  'students', COALESCE((sync_interval_days->>'students')::numeric * 24, 12),
  'activities', COALESCE((sync_interval_days->>'activities')::numeric * 24, 2.4),
  'grades', COALESCE((sync_interval_days->>'grades')::numeric * 24, 2.4)
)
WHERE sync_interval_hours IS NULL
   OR sync_interval_hours = '{}'::jsonb;
