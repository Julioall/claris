
-- Table to persist user sync preferences (replaces localStorage)
CREATE TABLE public.user_sync_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  selected_keys TEXT[] NOT NULL DEFAULT '{}',
  include_empty_courses BOOLEAN NOT NULL DEFAULT false,
  include_finished BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT user_sync_preferences_user_id_key UNIQUE (user_id)
);

-- No RLS needed since this app uses service role via edge functions
-- and the app doesn't use Supabase Auth - it uses Moodle auth with custom users table
-- We'll control access at application level using user_id matching

-- Enable RLS but with permissive policies since app authenticates via Moodle
ALTER TABLE public.user_sync_preferences ENABLE ROW LEVEL SECURITY;

-- Allow all operations (app manages auth via Moodle tokens, not Supabase auth)
CREATE POLICY "Allow all operations on sync preferences"
  ON public.user_sync_preferences
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_user_sync_preferences_updated_at
  BEFORE UPDATE ON public.user_sync_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
