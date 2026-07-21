import {
  RequestBodyValidationError,
  expectBodyObject,
} from '../_shared/http/mod.ts'
import {
  CALENDAR_EVENT_TYPES,
  type CalendarEventTypeDto,
} from './contract.ts'

export interface ListCalendarEventsPayload {
  action: 'list_events'
  filters: {
    from?: string
    to?: string
  }
  order: 'startAtAsc'
  page: number
  pageSize: number
}

export interface CalendarEventWritableFields {
  description?: string | null
  endAt?: string | null
  startAt?: string
  title?: string
  type?: CalendarEventTypeDto
}

export interface CreateCalendarEventPayload {
  action: 'create_event'
  input: CalendarEventWritableFields & { startAt: string; title: string }
}

export interface UpdateCalendarEventPayload {
  action: 'update_event'
  eventId: string
  input: CalendarEventWritableFields
}

export interface DeleteCalendarEventPayload {
  action: 'delete_event'
  eventId: string
}

export type CalendarEventsPayload =
  | ListCalendarEventsPayload
  | CreateCalendarEventPayload
  | UpdateCalendarEventPayload
  | DeleteCalendarEventPayload

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_PAGE = 1_000_000
const MAX_PAGE_SIZE = 1_000

function invalid(field: string): never {
  throw new RequestBodyValidationError(`Invalid ${field}`, 422)
}

function ensureExactFields(body: Record<string, unknown>, allowedFields: string[]) {
  const allowed = new Set(allowedFields)
  if (Object.keys(body).some((field) => !allowed.has(field))) invalid('request fields')
}

function parseObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(field)
  return value as Record<string, unknown>
}

function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) invalid(field)
  return value
}

function parseString(
  value: unknown,
  field: string,
  maximum: number,
  options: { nullable?: boolean; required?: boolean; trim?: boolean } = {},
): string | null | undefined {
  if (value === undefined) {
    if (options.required) invalid(field)
    return undefined
  }
  if (value === null) {
    if (!options.nullable) invalid(field)
    return null
  }
  if (typeof value !== 'string') invalid(field)
  const parsed = options.trim === false ? value : value.trim()
  if ((options.required && !parsed) || parsed.length > maximum) invalid(field)
  return parsed
}

function parseTimestamp(value: unknown, field: string, nullable = false): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) {
    if (!nullable) invalid(field)
    return null
  }
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) invalid(field)
  return new Date(value).toISOString()
}

function parsePositiveInteger(value: unknown, field: string, fallback: number, maximum: number): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) invalid(field)
  return value as number
}

function parseFilters(value: unknown): ListCalendarEventsPayload['filters'] {
  if (value === undefined) return {}
  const filters = parseObject(value, 'filters')
  ensureExactFields(filters, ['from', 'to'])
  const from = parseTimestamp(filters.from, 'filters.from')
  const to = parseTimestamp(filters.to, 'filters.to')
  if (from && to && from > to) invalid('filters date range')
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }
}
function parseWritableFields(
  value: unknown,
  create: boolean,
): CalendarEventWritableFields & { startAt?: string; title?: string } {
  const input = parseObject(value, 'input')
  ensureExactFields(input, ['description', 'endAt', 'startAt', 'title', 'type'])
  if (!create && Object.keys(input).length === 0) invalid('input')

  const parsed: CalendarEventWritableFields & { startAt?: string; title?: string } = {}
  const title = parseString(input.title, 'input.title', 240, { required: create })
  if (typeof title === 'string') parsed.title = title
  const description = parseString(input.description, 'input.description', 8_000, { nullable: true, trim: false })
  if (description !== undefined) parsed.description = description
  const startAt = parseTimestamp(input.startAt, 'input.startAt')
  if (startAt) parsed.startAt = startAt
  if (create && !startAt) invalid('input.startAt')
  const endAt = parseTimestamp(input.endAt, 'input.endAt', true)
  if (endAt !== undefined) parsed.endAt = endAt
  if (input.type !== undefined) {
    if (typeof input.type !== 'string' || !CALENDAR_EVENT_TYPES.includes(input.type as CalendarEventTypeDto)) {
      invalid('input.type')
    }
    parsed.type = input.type as CalendarEventTypeDto
  }
  return parsed
}

export function parseCalendarEventsPayload(rawBody: unknown): CalendarEventsPayload {
  const body = expectBodyObject(rawBody)
  switch (body.action) {
    case 'list_events': {
      ensureExactFields(body, ['action', 'filters', 'order', 'page', 'pageSize'])
      if (body.order !== undefined && body.order !== 'startAtAsc') invalid('order')
      return {
        action: 'list_events',
        filters: parseFilters(body.filters),
        order: 'startAtAsc',
        page: parsePositiveInteger(body.page, 'page', 1, MAX_PAGE),
        pageSize: parsePositiveInteger(body.pageSize, 'pageSize', 100, MAX_PAGE_SIZE),
      }
    }
    case 'create_event': {
      ensureExactFields(body, ['action', 'input'])
      const input = parseWritableFields(body.input, true)
      return { action: 'create_event', input: input as CreateCalendarEventPayload['input'] }
    }
    case 'update_event': {
      ensureExactFields(body, ['action', 'eventId', 'input'])
      return {
        action: 'update_event',
        eventId: parseUuid(body.eventId, 'eventId'),
        input: parseWritableFields(body.input, false),
      }
    }
    case 'delete_event': {
      ensureExactFields(body, ['action', 'eventId'])
      return { action: 'delete_event', eventId: parseUuid(body.eventId, 'eventId') }
    }
    default:
      invalid('action')
  }
}
