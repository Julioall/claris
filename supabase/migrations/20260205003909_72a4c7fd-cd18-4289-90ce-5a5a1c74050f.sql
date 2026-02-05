-- Create action_types table for custom action types
CREATE TABLE public.action_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    name text NOT NULL,
    label text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT action_types_user_name_unique UNIQUE (user_id, name)
);

-- Enable RLS
ALTER TABLE public.action_types ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own action types"
ON public.action_types
FOR SELECT
USING ((user_id = auth.uid()) OR (auth.uid() IS NULL));

CREATE POLICY "Users can create own action types"
ON public.action_types
FOR INSERT
WITH CHECK ((user_id = auth.uid()) OR (auth.uid() IS NULL));

CREATE POLICY "Users can update own action types"
ON public.action_types
FOR UPDATE
USING ((user_id = auth.uid()) OR (auth.uid() IS NULL));

CREATE POLICY "Users can delete own action types"
ON public.action_types
FOR DELETE
USING ((user_id = auth.uid()) OR (auth.uid() IS NULL));

-- Insert default action types for existing users (will be populated on first access)
-- Users will get defaults when they first load the settings page