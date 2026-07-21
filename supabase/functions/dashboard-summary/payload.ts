import {
  RequestBodyValidationError,
  expectBodyObject,
} from '../_shared/http/mod.ts'
import {
  DASHBOARD_WEEK_FILTERS,
  type DashboardWeekFilterDto,
} from './contract.ts'

export interface DashboardSummaryPayload {
  action: 'get_summary'
  courseId?: string
  week: DashboardWeekFilterDto
}

const ALLOWED_FIELDS = new Set(['action', 'courseId', 'week'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function invalid(field: string): never {
  throw new RequestBodyValidationError(`Invalid ${field}`, 422)
}

export function parseDashboardSummaryPayload(rawBody: unknown): DashboardSummaryPayload {
  const body = expectBodyObject(rawBody)

  if (Object.keys(body).some((field) => !ALLOWED_FIELDS.has(field))) {
    invalid('request fields')
  }
  if (body.action !== 'get_summary') invalid('action')
  if (typeof body.week !== 'string' || !DASHBOARD_WEEK_FILTERS.includes(body.week as DashboardWeekFilterDto)) {
    invalid('week')
  }

  const courseId = body.courseId
  if (courseId !== undefined && courseId !== null && courseId !== '') {
    if (typeof courseId !== 'string' || !UUID_PATTERN.test(courseId)) invalid('courseId')
  }

  return {
    action: 'get_summary',
    courseId: typeof courseId === 'string' && courseId.length > 0 ? courseId : undefined,
    week: body.week as DashboardWeekFilterDto,
  }
}
