import { ApiError } from '../_shared/http/mod.ts'
import {
  CALENDAR_EVENTS_CONTRACT_VERSION,
  type CalendarEventDeleteDto,
  type CalendarEventDto,
  type CalendarEventMutationDto,
  type CalendarEventsMetadataDto,
  type CalendarEventsPageDto,
} from './contract.ts'
import type {
  CalendarEventsPayload,
  UpdateCalendarEventPayload,
} from './payload.ts'
import type {
  CalendarEventRecord,
  CalendarEventsRepository,
} from './repository.ts'
import {
  assertValidCalendarInterval,
  normalizeCalendarEventType,
  normalizeCalendarExternalSource,
  normalizeCalendarSyncStatus,
} from './rules.ts'

export const AGENDA_VIEW_PERMISSION = 'agenda.view'

function metadata(now = new Date()): CalendarEventsMetadataDto {
  return {
    contractVersion: CALENDAR_EVENTS_CONTRACT_VERSION,
    generatedAt: now.toISOString(),
  }
}
function toEventDto(event: CalendarEventRecord): CalendarEventDto {
  return {
    ...event,
    externalSource: normalizeCalendarExternalSource(event.externalSource),
    syncStatus: normalizeCalendarSyncStatus(event.syncStatus),
    type: normalizeCalendarEventType(event.type),
  }
}

async function accessibleEvent(
  repository: CalendarEventsRepository,
  actorId: string,
  eventId: string,
): Promise<CalendarEventRecord> {
  const event = await repository.findEvent(actorId, eventId)
  if (!event) throw ApiError.notFound('Calendar event not found')
  return event
}

export async function authorizeCalendarEventsAction(
  repository: CalendarEventsRepository,
  actorId: string,
  _payload: CalendarEventsPayload,
): Promise<boolean> {
  return repository.userHasPermission(actorId, AGENDA_VIEW_PERMISSION)
}

export async function executeCalendarEvents(
  repository: CalendarEventsRepository,
  actorId: string,
  payload: CalendarEventsPayload,
): Promise<CalendarEventsPageDto | CalendarEventMutationDto | CalendarEventDeleteDto> {
  switch (payload.action) {
    case 'list_events': {
      const page = await repository.listEventsPage({
        actorId,
        from: payload.filters.from,
        limit: payload.pageSize,
        offset: (payload.page - 1) * payload.pageSize,
        to: payload.filters.to,
      })
      return {
        items: page.items.map(toEventDto),
        metadata: metadata(),
        page: payload.page,
        pageSize: payload.pageSize,
        totalCount: page.totalCount,
        totalPages: Math.ceil(page.totalCount / payload.pageSize),
      }
    }
    case 'create_event': {
      assertValidCalendarInterval(payload.input.startAt, payload.input.endAt)
      const event = await repository.createEvent(actorId, payload.input)
      return { event: toEventDto(event), metadata: metadata() }
    }
    case 'update_event': {
      const current = await accessibleEvent(repository, actorId, payload.eventId)
      const input: UpdateCalendarEventPayload['input'] = payload.input
      assertValidCalendarInterval(
        input.startAt ?? current.startAt,
        input.endAt === undefined ? current.endAt : input.endAt,
      )
      const event = await repository.updateEvent(actorId, payload.eventId, input)
      if (!event) throw ApiError.notFound('Calendar event not found')
      return { event: toEventDto(event), metadata: metadata() }
    }
    case 'delete_event': {
      await accessibleEvent(repository, actorId, payload.eventId)
      const deleted = await repository.deleteEvent(actorId, payload.eventId)
      if (!deleted) throw ApiError.notFound('Calendar event not found')
      return { deleted: true, metadata: metadata() }
    }
  }
}
