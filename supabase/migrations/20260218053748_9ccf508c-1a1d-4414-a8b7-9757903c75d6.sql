
-- Cache of Moodle conversations
CREATE TABLE public.moodle_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  moodle_conversation_id TEXT NOT NULL,
  student_id UUID NOT NULL,
  last_message_text TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE,
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, student_id)
);

-- Cache of individual messages
CREATE TABLE public.moodle_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.moodle_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  moodle_message_id TEXT NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('tutor', 'student')),
  sender_name TEXT,
  content TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, moodle_message_id)
);

-- Enable RLS
ALTER TABLE public.moodle_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodle_messages ENABLE ROW LEVEL SECURITY;

-- Conversations RLS
CREATE POLICY "moodle_conversations_select" ON public.moodle_conversations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "moodle_conversations_insert" ON public.moodle_conversations
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "moodle_conversations_update" ON public.moodle_conversations
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "moodle_conversations_delete" ON public.moodle_conversations
  FOR DELETE USING (user_id = auth.uid());

-- Messages RLS
CREATE POLICY "moodle_messages_select" ON public.moodle_messages
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "moodle_messages_insert" ON public.moodle_messages
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "moodle_messages_delete" ON public.moodle_messages
  FOR DELETE USING (user_id = auth.uid());

-- Indexes
CREATE INDEX idx_moodle_conversations_user ON public.moodle_conversations(user_id);
CREATE INDEX idx_moodle_conversations_student ON public.moodle_conversations(student_id);
CREATE INDEX idx_moodle_messages_conversation ON public.moodle_messages(conversation_id);
CREATE INDEX idx_moodle_messages_sent_at ON public.moodle_messages(sent_at);

-- Trigger for updated_at
CREATE TRIGGER update_moodle_conversations_updated_at
  BEFORE UPDATE ON public.moodle_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
