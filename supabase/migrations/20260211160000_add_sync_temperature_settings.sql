ALTER TABLE public.user_sync_preferences
  ADD COLUMN IF NOT EXISTS entity_temperatures JSONB NOT NULL DEFAULT '{"courses":"cold","students":"medium","activities":"hot","grades":"hot"}'::jsonb,
  ADD COLUMN IF NOT EXISTS enabled_temperatures JSONB NOT NULL DEFAULT '{"cold":false,"medium":true,"hot":true}'::jsonb;
