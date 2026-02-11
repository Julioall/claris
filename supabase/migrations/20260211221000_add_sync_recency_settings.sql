ALTER TABLE public.user_sync_preferences
  ADD COLUMN IF NOT EXISTS sync_interval_days JSONB NOT NULL DEFAULT '{"courses":1,"students":0.5,"activities":0.1,"grades":0.1}'::jsonb,
  ADD COLUMN IF NOT EXISTS entity_last_sync JSONB NOT NULL DEFAULT '{}'::jsonb;
