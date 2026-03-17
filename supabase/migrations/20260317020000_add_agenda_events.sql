-- Agenda events table (Agenda module)
-- Tracks commitments, meetings, WebAulas and recurring routines.
-- Architecture is prepared for future Microsoft Teams integration.
CREATE TABLE IF NOT EXISTS public.agenda_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'compromisso',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT false,
  location TEXT,
  meeting_url TEXT,
  -- Recurrence
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_rule TEXT, -- iCal RRULE string for future calendar protocol support
  recurrence_parent_id UUID REFERENCES public.agenda_events(id) ON DELETE CASCADE,
  -- Participants stored as JSONB array of {user_id, name, email}
  participants JSONB DEFAULT '[]'::jsonb,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- Future: Microsoft Teams integration
  teams_event_id TEXT,
  teams_online_meeting_url TEXT,
  teams_join_url TEXT,
  synced_from_teams_at TIMESTAMPTZ,
  -- Status
  status TEXT NOT NULL DEFAULT 'agendado',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agenda_events_type_check CHECK (
    event_type IN ('reuniao', 'webaula', 'rotina', 'compromisso', 'outro')
  ),
  CONSTRAINT agenda_events_status_check CHECK (
    status IN ('agendado', 'em_andamento', 'concluido', 'cancelado')
  )
);

CREATE INDEX IF NOT EXISTS idx_agenda_events_start_at
  ON public.agenda_events(start_at);

CREATE INDEX IF NOT EXISTS idx_agenda_events_created_by
  ON public.agenda_events(created_by_user_id, start_at);

CREATE INDEX IF NOT EXISTS idx_agenda_events_type_start
  ON public.agenda_events(event_type, start_at);

ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_agenda_events_updated_at ON public.agenda_events;
CREATE TRIGGER update_agenda_events_updated_at
  BEFORE UPDATE ON public.agenda_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Visibility: creators see their events; participants see events they're in
CREATE POLICY "Users can view events they created or participate in"
  ON public.agenda_events FOR SELECT
  USING (
    created_by_user_id = auth.uid()
    OR participants @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
  );

CREATE POLICY "Users can insert agenda events"
  ON public.agenda_events FOR INSERT
  WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY "Users can update events they created"
  ON public.agenda_events FOR UPDATE
  USING (created_by_user_id = auth.uid());

CREATE POLICY "Users can delete events they created"
  ON public.agenda_events FOR DELETE
  USING (created_by_user_id = auth.uid());
