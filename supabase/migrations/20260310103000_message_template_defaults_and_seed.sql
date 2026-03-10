ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS default_key text;

CREATE UNIQUE INDEX IF NOT EXISTS message_templates_user_default_key_unique
  ON public.message_templates (user_id, default_key)
  WHERE default_key IS NOT NULL;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS message_templates_seeded_at timestamptz;
