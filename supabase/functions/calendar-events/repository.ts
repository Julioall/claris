import { userHasPermission as checkPermission } from '../_shared/auth/mod.ts'
import {
  createServiceClient,
  type AppSupabaseClient,
} from '../_shared/db/mod.ts'
import type { CalendarEventWritableFields } from './payload.ts'

export interface CalendarEventRecord {
  createdAt: string
  description: string | null
  endAt: string | null
  externalEventId: string | null
  externalId: string | null
  externalProvider: string | null
  externalSource: string
  id: string
  lastSyncAt: string | null
  startAt: string
  syncStatus: string | null
  title: string
  type: string
  updatedAt: string
}

export interface CalendarEventsRepository {
  createEvent(actorId: string, input: CalendarEventWritableFields & {
    startAt: string
    title: string
  }): Promise<CalendarEventRecord>
  deleteEvent(actorId: string, eventId: string): Promise<boolean>
  findEvent(actorId: string, eventId: string): Promise<CalendarEventRecord | null>
  listEventsPage(input: {
    actorId: string
    from?: string
    limit: number
    offset: number
    to?: string
  }): Promise<{ items: CalendarEventRecord[]; totalCount: number }>
  updateEvent(actorId: string, eventId: string, input: CalendarEventWritableFields): Promise<CalendarEventRecord | null>
  userHasPermission(userId: string, permission: string): Promise<boolean>
}

type CalendarEventRow = {
  created_at: string
  description: string | null
  end_at: string | null
  external_event_id: string | null
  external_id: string | null
  external_provider: string | null
  external_source: string
  id: string
  last_sync_at: string | null
  start_at: string
  sync_status: string | null
  title: string
  type: string
  updated_at: string
}

function toEvent(row: CalendarEventRow): CalendarEventRecord {
  return {
    createdAt: row.created_at,
    description: row.description,
    endAt: row.end_at,
    externalEventId: row.external_event_id,
    externalId: row.external_id,
    externalProvider: row.external_provider,
    externalSource: row.external_source,
    id: row.id,
    lastSyncAt: row.last_sync_at,
    startAt: row.start_at,
    syncStatus: row.sync_status,
    title: row.title,
    type: row.type,
    updatedAt: row.updated_at,
  }
}
function mapEventPatch(input: CalendarEventWritableFields) {
  return {
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.endAt !== undefined ? { end_at: input.endAt } : {}),
    ...(input.startAt !== undefined ? { start_at: input.startAt } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
  }
}

export function createCalendarEventsRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): CalendarEventsRepository {
  return {
    async userHasPermission(userId, permission) {
      return checkPermission(supabase, userId, permission)
    },

    async listEventsPage(input) {
      let query = supabase
        .from('calendar_events')
        .select('*', { count: 'exact' })
        .eq('owner', input.actorId)
        .order('start_at')
        .order('id')
      if (input.from) query = query.gte('start_at', input.from)
      if (input.to) query = query.lte('start_at', input.to)
      const { data, error, count } = await query.range(input.offset, input.offset + input.limit - 1)
      if (error) throw error
      return {
        items: (data ?? []).map(toEvent),
        totalCount: count ?? 0,
      }
    },

    async findEvent(actorId, eventId) {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('id', eventId)
        .eq('owner', actorId)
        .maybeSingle()
      if (error) throw error
      return data ? toEvent(data) : null
    },

    async createEvent(actorId, input) {
      const { data, error } = await supabase
        .from('calendar_events')
        .insert({
          ...mapEventPatch(input),
          external_source: 'manual',
          ia_source: 'manual',
          owner: actorId,
          start_at: input.startAt,
          title: input.title,
        })
        .select()
        .single()
      if (error) throw error
      return toEvent(data)
    },

    async updateEvent(actorId, eventId, input) {
      const { data, error } = await supabase
        .from('calendar_events')
        .update(mapEventPatch(input))
        .eq('id', eventId)
        .eq('owner', actorId)
        .select()
        .maybeSingle()
      if (error) throw error
      return data ? toEvent(data) : null
    },

    async deleteEvent(actorId, eventId) {
      const { data, error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', eventId)
        .eq('owner', actorId)
        .select('id')
        .maybeSingle()
      if (error) throw error
      return Boolean(data)
    },
  }
}
