ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS sync_category_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

