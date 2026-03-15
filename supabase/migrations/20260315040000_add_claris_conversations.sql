CREATE TABLE IF NOT EXISTS public.claris_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Nova conversa',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_context_route TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.claris_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "claris_conversations_select"
ON public.claris_conversations
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "claris_conversations_insert"
ON public.claris_conversations
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "claris_conversations_update"
ON public.claris_conversations
FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "claris_conversations_delete"
ON public.claris_conversations
FOR DELETE
USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_claris_conversations_user_updated
ON public.claris_conversations(user_id, updated_at DESC);

DROP TRIGGER IF EXISTS update_claris_conversations_updated_at ON public.claris_conversations;
CREATE TRIGGER update_claris_conversations_updated_at
  BEFORE UPDATE ON public.claris_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
