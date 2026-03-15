ALTER TABLE public.user_sync_preferences
ADD COLUMN IF NOT EXISTS claris_llm_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
