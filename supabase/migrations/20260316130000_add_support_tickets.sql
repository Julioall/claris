-- Support tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'problema',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  route TEXT,
  context JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'aberto',
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_type_check CHECK (type IN ('problema', 'sugestao', 'duvida', 'outro')),
  CONSTRAINT support_tickets_status_check CHECK (status IN ('aberto', 'em_andamento', 'resolvido', 'fechado')),
  CONSTRAINT support_tickets_priority_check CHECK (priority IN ('baixa', 'normal', 'alta', 'critica'))
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_created
  ON public.support_tickets(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created
  ON public.support_tickets(status, created_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Users can see their own tickets
CREATE POLICY "support_tickets_select"
ON public.support_tickets
FOR SELECT
USING (user_id = auth.uid() OR public.is_application_admin());

-- Authenticated users can insert tickets
CREATE POLICY "support_tickets_insert"
ON public.support_tickets
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Only admins can update tickets
CREATE POLICY "support_tickets_update"
ON public.support_tickets
FOR UPDATE
USING (public.is_application_admin())
WITH CHECK (public.is_application_admin());

GRANT SELECT, INSERT ON public.support_tickets TO authenticated;
GRANT UPDATE ON public.support_tickets TO authenticated;
