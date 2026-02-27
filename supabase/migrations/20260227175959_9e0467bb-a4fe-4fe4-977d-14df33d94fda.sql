
-- Add missing columns to user_sync_preferences
ALTER TABLE public.user_sync_preferences ADD COLUMN IF NOT EXISTS sync_interval_hours jsonb DEFAULT '{}';
ALTER TABLE public.user_sync_preferences ADD COLUMN IF NOT EXISTS risk_threshold_days jsonb DEFAULT '{}';
