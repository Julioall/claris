import { supabase } from '@/integrations/supabase/client';
import type { CalendarEvent, CalendarEventType, ExternalSource } from '@/types';

export interface CreateCalendarEventInput {
  title: string;
  description?: string;
  start_at: string;
  end_at?: string;
  type?: CalendarEventType;
  owner?: string;
  external_source?: ExternalSource;
}

export type UpdateCalendarEventInput = Partial<CreateCalendarEventInput>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCalendarEvent(row: any): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    start_at: row.start_at,
    end_at: row.end_at,
    type: row.type,
    owner: row.owner,
    external_source: row.external_source,
    external_id: row.external_id,
    external_provider: row.external_provider,
    external_event_id: row.external_event_id,
    sync_status: row.sync_status,
    last_sync_at: row.last_sync_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const calendarService = {
  async listEvents(from?: string, to?: string, ownerId?: string): Promise<CalendarEvent[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from('calendar_events' as never) as any)
      .select('*')
      .order('start_at', { ascending: true });
    if (from) query = query.gte('start_at', from);
    if (to) query = query.lte('start_at', to);
    if (ownerId) query = query.eq('owner', ownerId);
    const { data, error } = await query;
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map(toCalendarEvent);
  },

  async createEvent(input: CreateCalendarEventInput): Promise<CalendarEvent> {
    const { data, error } = await supabase
      .from('calendar_events' as never)
      .insert({ ...input, external_source: input.external_source ?? 'manual' } as never)
      .select()
      .single();
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return toCalendarEvent(data as any);
  },

  async updateEvent(id: string, input: UpdateCalendarEventInput): Promise<CalendarEvent> {
    const { data, error } = await supabase
      .from('calendar_events' as never)
      .update(input as never)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return toCalendarEvent(data as any);
  },

  async deleteEvent(id: string): Promise<void> {
    const { error } = await supabase.from('calendar_events' as never).delete().eq('id', id);
    if (error) throw error;
  },
};
