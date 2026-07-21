import {
  RequestBodyValidationError,
  expectBodyObject,
} from '../_shared/http/mod.ts'
import {
  ATTENDANCE_STATUSES,
  type AttendanceStatusDto,
} from './contract.ts'

export interface GetAttendanceOverviewPayload {
  action: 'get_overview'
  courseId: string
  limit: number
  offset: number
}

export interface GetAttendanceSheetPayload {
  action: 'get_sheet'
  courseId: string
  date: string
}

export interface SaveAttendanceSheetPayload {
  action: 'save_sheet'
  courseId: string
  date: string
  entries: Array<{
    notes: string | null
    status: AttendanceStatusDto
    studentId: string
  }>
}

export type CourseAttendancePayload =
  | GetAttendanceOverviewPayload
  | GetAttendanceSheetPayload
  | SaveAttendanceSheetPayload

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_ENTRIES = 500
const MAX_NOTES_LENGTH = 500
const DEFAULT_LIMIT = 120
const MAX_LIMIT = 120
const MAX_OFFSET = 100_000

function invalid(field: string): never {
  throw new RequestBodyValidationError(`Invalid ${field}`, 422)
}

function ensureExactFields(body: Record<string, unknown>, allowed: string[]) {
  const allowedSet = new Set(allowed)
  if (Object.keys(body).some((field) => !allowedSet.has(field))) invalid('request fields')
}

function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) invalid(field)
  return value
}

function parseDate(value: unknown): string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) invalid('date')
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() + 1 !== month
    || parsed.getUTCDate() !== day
  ) invalid('date')
  return value
}

function parseInteger(
  value: unknown,
  field: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid(field)
  return value as number
}

function parseEntries(value: unknown): SaveAttendanceSheetPayload['entries'] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ENTRIES) invalid('entries')

  const studentIds = new Set<string>()
  return value.map((rawEntry) => {
    const entry = expectBodyObject(rawEntry)
    ensureExactFields(entry, ['studentId', 'status', 'notes'])

    const studentId = parseUuid(entry.studentId, 'entries.studentId')
    if (studentIds.has(studentId)) invalid('entries.studentId')
    studentIds.add(studentId)

    if (
      typeof entry.status !== 'string'
      || !ATTENDANCE_STATUSES.includes(entry.status as AttendanceStatusDto)
    ) invalid('entries.status')

    if (
      entry.notes !== undefined
      && entry.notes !== null
      && (typeof entry.notes !== 'string' || entry.notes.length > MAX_NOTES_LENGTH)
    ) invalid('entries.notes')

    return {
      notes: typeof entry.notes === 'string' && entry.notes.length > 0 ? entry.notes : null,
      status: entry.status as AttendanceStatusDto,
      studentId,
    }
  })
}

export function parseCourseAttendancePayload(rawBody: unknown): CourseAttendancePayload {
  const body = expectBodyObject(rawBody)

  if (body.action === 'get_overview') {
    ensureExactFields(body, ['action', 'courseId', 'limit', 'offset'])
    return {
      action: 'get_overview',
      courseId: parseUuid(body.courseId, 'courseId'),
      limit: parseInteger(body.limit, 'limit', DEFAULT_LIMIT, 1, MAX_LIMIT),
      offset: parseInteger(body.offset, 'offset', 0, 0, MAX_OFFSET),
    }
  }

  if (body.action === 'get_sheet') {
    ensureExactFields(body, ['action', 'courseId', 'date'])
    return {
      action: 'get_sheet',
      courseId: parseUuid(body.courseId, 'courseId'),
      date: parseDate(body.date),
    }
  }

  if (body.action === 'save_sheet') {
    ensureExactFields(body, ['action', 'courseId', 'date', 'entries'])
    return {
      action: 'save_sheet',
      courseId: parseUuid(body.courseId, 'courseId'),
      date: parseDate(body.date),
      entries: parseEntries(body.entries),
    }
  }

  invalid('action')
}
