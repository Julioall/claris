import { ApiClientError, invokeEdgeFunction } from '@/integrations/http/edge-function-client';

import type { CalendarEvent, CreateCalendarEventInput, UpdateCalendarEventInput } from '../types';
import {
  CALENDAR_EVENTS_CONTRACT_VERSION,
  CALENDAR_EVENT_TYPES,
  CALENDAR_EXTERNAL_SOURCES,
  CALENDAR_SYNC_STATUSES,
  type CalendarEventDeleteDto,
  type CalendarEventDto,
  type CalendarEventMutationDto,
  type CalendarEventsMetadataDto,
  type CalendarEventsPageDto,
} from './contracts/calendar-events.contract';
import { mapCalendarEvent } from './mappers/calendar-event.mapper';

const CALENDAR_TIMEOUT_MS = 15_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function invalidResponse(expected: string): never {
  throw new ApiClientError({
    code: 'invalid_response',
    message: `A API da agenda retornou ${expected} em formato invalido.`,
  });
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isMetadata(value: unknown): value is CalendarEventsMetadataDto {
  const metadata = asRecord(value);
  return Boolean(
    metadata
    && metadata.contractVersion === CALENDAR_EVENTS_CONTRACT_VERSION
    && typeof metadata.generatedAt === 'string',
  );
}

function isEvent(value: unknown): value is CalendarEventDto {
  const event = asRecord(value);
  return Boolean(
    event
    && typeof event.id === 'string'
    && typeof event.title === 'string'
    && isNullableString(event.description)
    && typeof event.startAt === 'string'
    && isNullableString(event.endAt)
    && CALENDAR_EVENT_TYPES.includes(event.type as CalendarEventDto['type'])
    && CALENDAR_EXTERNAL_SOURCES.includes(event.externalSource as CalendarEventDto['externalSource'])
    && isNullableString(event.externalId)
    && isNullableString(event.externalProvider)
    && isNullableString(event.externalEventId)
    && CALENDAR_SYNC_STATUSES.includes(event.syncStatus as CalendarEventDto['syncStatus'])
    && isNullableString(event.lastSyncAt)
    && typeof event.createdAt === 'string'
    && typeof event.updatedAt === 'string',
  );
}

function parsePage(value: unknown): CalendarEventsPageDto {
  const page = asRecord(value);
  if (!(
    page
    && Array.isArray(page.items)
    && page.items.every(isEvent)
    && Number.isSafeInteger(page.page)
    && Number.isSafeInteger(page.pageSize)
    && Number.isSafeInteger(page.totalCount)
    && Number.isSafeInteger(page.totalPages)
    && isMetadata(page.metadata)
  )) invalidResponse('uma pagina');
  return page as unknown as CalendarEventsPageDto;
}

function parseMutation(value: unknown): CalendarEventMutationDto {
  const mutation = asRecord(value);
  if (!(mutation && isEvent(mutation.event) && isMetadata(mutation.metadata))) {
    invalidResponse('um evento');
  }
  return mutation as unknown as CalendarEventMutationDto;
}

function parseDelete(value: unknown): CalendarEventDeleteDto {
  const deletion = asRecord(value);
  if (!(deletion && typeof deletion.deleted === 'boolean' && isMetadata(deletion.metadata))) {
    invalidResponse('uma confirmacao de exclusao');
  }
  return deletion as unknown as CalendarEventDeleteDto;
}

function toEventInput(input: CreateCalendarEventInput | UpdateCalendarEventInput) {
  return {
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.end_at !== undefined ? { endAt: input.end_at } : {}),
    ...(input.start_at !== undefined ? { startAt: input.start_at } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
  };
}

export async function listCalendarEvents(
  from?: string,
  to?: string,
  signal?: AbortSignal,
): Promise<CalendarEvent[]> {
  const response = await invokeEdgeFunction<unknown>('calendar-events', {
    auth: 'required',
    body: {
      action: 'list_events',
      filters: {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      },
      order: 'startAtAsc',
      page: 1,
      pageSize: 1_000,
    },
    signal,
    timeoutMs: CALENDAR_TIMEOUT_MS,
  });
  return parsePage(response).items.map(mapCalendarEvent);
}

export async function createCalendarEvent(input: CreateCalendarEventInput): Promise<CalendarEvent> {
  const response = await invokeEdgeFunction<unknown>('calendar-events', {
    auth: 'required',
    body: { action: 'create_event', input: toEventInput(input) },
    timeoutMs: CALENDAR_TIMEOUT_MS,
  });
  return mapCalendarEvent(parseMutation(response).event);
}

export async function updateCalendarEvent(id: string, input: UpdateCalendarEventInput): Promise<CalendarEvent> {
  const response = await invokeEdgeFunction<unknown>('calendar-events', {
    auth: 'required',
    body: { action: 'update_event', eventId: id, input: toEventInput(input) },
    timeoutMs: CALENDAR_TIMEOUT_MS,
  });
  return mapCalendarEvent(parseMutation(response).event);
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const response = await invokeEdgeFunction<unknown>('calendar-events', {
    auth: 'required',
    body: { action: 'delete_event', eventId: id },
    timeoutMs: CALENDAR_TIMEOUT_MS,
  });
  if (!parseDelete(response).deleted) invalidResponse('uma confirmacao de exclusao');
}

export const calendarRepository = {
  listEvents: listCalendarEvents,
  createEvent: createCalendarEvent,
  updateEvent: updateCalendarEvent,
  deleteEvent: deleteCalendarEvent,
};
