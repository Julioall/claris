import {
  RequestBodyValidationError,
  expectBodyObject,
} from '../_shared/http/mod.ts'
import {
  STUDENT_ENROLLMENT_STATUSES,
  STUDENT_RISK_LEVELS,
  type StudentEnrollmentStatusDto,
  type StudentRiskLevelDto,
} from './contract.ts'

export interface ListStudentsPayload {
  action: 'list_students'
  filters: {
    courseId?: string
    enrollmentStatus?: StudentEnrollmentStatusDto
    riskLevel?: StudentRiskLevelDto
    search?: string
  }
  page: number
  pageSize: number
}

export interface GetStudentProfilePayload {
  action: 'get_profile'
  studentId: string
}

export interface GetStudentHistoryPayload {
  action: 'get_history'
  studentId: string
}

export type StudentsPayload =
  | ListStudentsPayload
  | GetStudentProfilePayload
  | GetStudentHistoryPayload

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_SEARCH_LENGTH = 200
const MAX_PAGE = 1_000_000
const MAX_PAGE_SIZE = 100

function invalid(field: string): never {
  throw new RequestBodyValidationError(`Invalid ${field}`, 422)
}

function ensureExactFields(body: Record<string, unknown>, allowedFields: string[]) {
  const allowed = new Set(allowedFields)
  if (Object.keys(body).some((field) => !allowed.has(field))) invalid('request fields')
}

function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) invalid(field)
  return value
}

function parsePositiveInteger(
  value: unknown,
  field: string,
  defaultValue: number,
  maximum: number,
): number {
  if (value === undefined) return defaultValue
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    invalid(field)
  }
  return value as number
}

function parseFilters(value: unknown): ListStudentsPayload['filters'] {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('filters')
  const filters = value as Record<string, unknown>
  ensureExactFields(filters, ['courseId', 'enrollmentStatus', 'riskLevel', 'search'])

  const parsed: ListStudentsPayload['filters'] = {}
  if (filters.courseId !== undefined) parsed.courseId = parseUuid(filters.courseId, 'filters.courseId')

  if (filters.enrollmentStatus !== undefined) {
    if (
      typeof filters.enrollmentStatus !== 'string'
      || !STUDENT_ENROLLMENT_STATUSES.includes(filters.enrollmentStatus as StudentEnrollmentStatusDto)
    ) invalid('filters.enrollmentStatus')
    parsed.enrollmentStatus = filters.enrollmentStatus as StudentEnrollmentStatusDto
  }

  if (filters.riskLevel !== undefined) {
    if (
      typeof filters.riskLevel !== 'string'
      || !STUDENT_RISK_LEVELS.includes(filters.riskLevel as StudentRiskLevelDto)
    ) invalid('filters.riskLevel')
    parsed.riskLevel = filters.riskLevel as StudentRiskLevelDto
  }

  if (filters.search !== undefined) {
    if (typeof filters.search !== 'string') invalid('filters.search')
    const search = filters.search.trim()
    if (search.length > MAX_SEARCH_LENGTH) invalid('filters.search')
    if (search) parsed.search = search
  }

  return parsed
}

export function parseStudentsPayload(rawBody: unknown): StudentsPayload {
  const body = expectBodyObject(rawBody)

  if (body.action === 'list_students') {
    ensureExactFields(body, ['action', 'filters', 'page', 'pageSize'])
    return {
      action: 'list_students',
      filters: parseFilters(body.filters),
      page: parsePositiveInteger(body.page, 'page', 1, MAX_PAGE),
      pageSize: parsePositiveInteger(body.pageSize, 'pageSize', 30, MAX_PAGE_SIZE),
    }
  }

  if (body.action === 'get_profile' || body.action === 'get_history') {
    ensureExactFields(body, ['action', 'studentId'])
    return {
      action: body.action,
      studentId: parseUuid(body.studentId, 'studentId'),
    }
  }

  invalid('action')
}
