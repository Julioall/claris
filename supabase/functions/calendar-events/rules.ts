import { ApiError } from '../_shared/http/mod.ts'
import {
  CALENDAR_EVENT_TYPES,
  CALENDAR_EXTERNAL_SOURCES,
  CALENDAR_SYNC_STATUSES,
  type CalendarEventTypeDto,
  type CalendarExternalSourceDto,
  type CalendarSyncStatusDto,
} from './contract.ts'

export function normalizeCalendarEventType(value: string): CalendarEventTypeDto {
  return CALENDAR_EVENT_TYPES.includes(value as CalendarEventTypeDto)
    ? value as CalendarEventTypeDto
    : 'other'
}

export function normalizeCalendarExternalSource(value: string): CalendarExternalSourceDto {
  return CALENDAR_EXTERNAL_SOURCES.includes(value as CalendarExternalSourceDto)
    ? value as CalendarExternalSourceDto
    : 'manual'
}

export function normalizeCalendarSyncStatus(value: string | null): CalendarSyncStatusDto {
  return value && CALENDAR_SYNC_STATUSES.includes(value as CalendarSyncStatusDto)
    ? value as CalendarSyncStatusDto
    : 'none'
}

export function assertValidCalendarInterval(startAt: string, endAt: string | null | undefined): void {
  if (endAt && Date.parse(endAt) < Date.parse(startAt)) {
    throw ApiError.unprocessable('Calendar event end must not be before its start', {
      endAt,
      startAt,
    })
  }
}
