import { supabase } from '@/integrations/supabase/client';

import type { CalendarEvent } from '../types';
import type { CreateCalendarEventInput, UpdateCalendarEventInput } from '../types';

type CalendarEventRow = CalendarEvent;

function toCalendarEvent(row: CalendarEventRow): CalendarEvent {
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

export async function listCalendarEvents(from?: string, to?: string, ownerId?: string): Promise<CalendarEvent[]> {
  let query = supabase
    .from('calendar_events' as never)
    .select('*')
    .order('start_at', { ascending: true });

  if (from) query = query.gte('start_at', from);
  if (to) query = query.lte('start_at', to);
  if (ownerId) query = query.eq('owner', ownerId);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as CalendarEventRow[]).map(toCalendarEvent);
}

export async function createCalendarEvent(input: CreateCalendarEventInput): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('calendar_events' as never)
    .insert({ ...input, external_source: input.external_source ?? 'manual' } as never)
    .select()
    .single();

  if (error) throw error;

  return toCalendarEvent(data as CalendarEventRow);
}

export async function updateCalendarEvent(id: string, input: UpdateCalendarEventInput): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('calendar_events' as never)
    .update(input as never)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  return toCalendarEvent(data as CalendarEventRow);
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const { error } = await supabase
    .from('calendar_events' as never)
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export const calendarRepository = {
  listEvents: listCalendarEvents,
  createEvent: createCalendarEvent,
  updateEvent: updateCalendarEvent,
  deleteEvent: deleteCalendarEvent,
};
