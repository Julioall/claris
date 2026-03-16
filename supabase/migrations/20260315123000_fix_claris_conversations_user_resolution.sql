CREATE OR REPLACE FUNCTION public.resolve_current_app_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_moodle_user_id text;
BEGIN
  SELECT u.id
  INTO v_user_id
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    RETURN v_user_id;
  END IF;

  v_moodle_user_id := auth.jwt() -> 'user_metadata' ->> 'moodle_user_id';

  IF v_moodle_user_id IS NULL OR btrim(v_moodle_user_id) = '' THEN
    RETURN NULL;
  END IF;

  SELECT u.id
  INTO v_user_id
  FROM public.users u
  WHERE u.moodle_user_id = v_moodle_user_id
  ORDER BY u.created_at DESC NULLS LAST
  LIMIT 1;

  RETURN v_user_id;
END;
$$;

DROP POLICY IF EXISTS "claris_conversations_select" ON public.claris_conversations;
DROP POLICY IF EXISTS "claris_conversations_insert" ON public.claris_conversations;
DROP POLICY IF EXISTS "claris_conversations_update" ON public.claris_conversations;
DROP POLICY IF EXISTS "claris_conversations_delete" ON public.claris_conversations;

CREATE POLICY "claris_conversations_select"
ON public.claris_conversations
FOR SELECT
USING (user_id = public.resolve_current_app_user_id());

CREATE POLICY "claris_conversations_insert"
ON public.claris_conversations
FOR INSERT
WITH CHECK (user_id = public.resolve_current_app_user_id());

CREATE POLICY "claris_conversations_update"
ON public.claris_conversations
FOR UPDATE
USING (user_id = public.resolve_current_app_user_id())
WITH CHECK (user_id = public.resolve_current_app_user_id());

CREATE POLICY "claris_conversations_delete"
ON public.claris_conversations
FOR DELETE
USING (user_id = public.resolve_current_app_user_id());
