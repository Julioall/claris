import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { AgendaEvent, AgendaEventType, AgendaEventStatus, AgendaParticipant } from '@/types';

interface AgendaEventRow {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  location: string | null;
  meeting_url: string | null;
  is_recurring: boolean;
  recurrence_rule: string | null;
  recurrence_parent_id: string | null;
  participants: unknown;
  created_by_user_id: string | null;
  teams_event_id: string | null;
  teams_online_meeting_url: string | null;
  teams_join_url: string | null;
  synced_from_teams_at: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
}

function rowToEvent(row: AgendaEventRow): AgendaEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    event_type: (row.event_type as AgendaEventType) ?? 'compromisso',
    start_at: row.start_at,
    end_at: row.end_at ?? undefined,
    all_day: row.all_day,
    location: row.location ?? undefined,
    meeting_url: row.meeting_url ?? undefined,
    is_recurring: row.is_recurring,
    recurrence_rule: row.recurrence_rule ?? undefined,
    recurrence_parent_id: row.recurrence_parent_id ?? undefined,
    participants: Array.isArray(row.participants) ? (row.participants as AgendaParticipant[]) : [],
    created_by_user_id: row.created_by_user_id ?? undefined,
    teams_event_id: row.teams_event_id ?? undefined,
    teams_online_meeting_url: row.teams_online_meeting_url ?? undefined,
    teams_join_url: row.teams_join_url ?? undefined,
    synced_from_teams_at: row.synced_from_teams_at ?? undefined,
    status: (row.status as AgendaEventStatus) ?? 'agendado',
    created_at: row.created_at,
    updated_at: row.updated_at ?? undefined,
  };
}

export function useAgendaData() {
  const { user } = useAuth();
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!user) {
      setEvents([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await (supabase as unknown as {
        from: (table: string) => {
          select: (q: string) => {
            eq: (col: string, val: string) => {
              order: (col: string, opts: { ascending: boolean }) => Promise<{ data: AgendaEventRow[] | null; error: Error | null }>;
            };
          };
        };
      }).from('agenda_events')
        .select('*')
        .eq('created_by_user_id', user.id)
        .order('start_at', { ascending: true });

      if (fetchError) throw fetchError;

      setEvents((data ?? []).map(rowToEvent));
    } catch (err) {
      console.error('Error fetching agenda events:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar agenda');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const createEvent = useCallback(async (payload: {
    title: string;
    description?: string;
    event_type?: AgendaEventType;
    start_at: string;
    end_at?: string;
    all_day?: boolean;
    location?: string;
    meeting_url?: string;
    participants?: AgendaParticipant[];
  }) => {
    if (!user) return false;

    try {
      const { error: insertError } = await (supabase as unknown as {
        from: (table: string) => {
          insert: (row: Record<string, unknown>) => Promise<{ error: Error | null }>;
        };
      }).from('agenda_events').insert({
        title: payload.title,
        description: payload.description ?? null,
        event_type: payload.event_type ?? 'compromisso',
        start_at: payload.start_at,
        end_at: payload.end_at ?? null,
        all_day: payload.all_day ?? false,
        location: payload.location ?? null,
        meeting_url: payload.meeting_url ?? null,
        participants: payload.participants ?? [],
        created_by_user_id: user.id,
        status: 'agendado',
      });

      if (insertError) throw insertError;

      await fetchEvents();
      return true;
    } catch (err) {
      console.error('Error creating agenda event:', err);
      return false;
    }
  }, [user, fetchEvents]);

  const updateEventStatus = useCallback(async (eventId: string, status: AgendaEventStatus) => {
    try {
      const { error: updateError } = await (supabase as unknown as {
        from: (table: string) => {
          update: (row: Record<string, unknown>) => {
            eq: (col: string, val: string) => Promise<{ error: Error | null }>;
          };
        };
      }).from('agenda_events')
        .update({ status })
        .eq('id', eventId);

      if (updateError) throw updateError;

      await fetchEvents();
      return true;
    } catch (err) {
      console.error('Error updating agenda event status:', err);
      return false;
    }
  }, [fetchEvents]);

  const deleteEvent = useCallback(async (eventId: string) => {
    try {
      const { error: deleteError } = await (supabase as unknown as {
        from: (table: string) => {
          delete: () => {
            eq: (col: string, val: string) => Promise<{ error: Error | null }>;
          };
        };
      }).from('agenda_events')
        .delete()
        .eq('id', eventId);

      if (deleteError) throw deleteError;

      await fetchEvents();
      return true;
    } catch (err) {
      console.error('Error deleting agenda event:', err);
      return false;
    }
  }, [fetchEvents]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, isLoading, error, refetch: fetchEvents, createEvent, updateEventStatus, deleteEvent };
}
