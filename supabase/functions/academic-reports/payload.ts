import {
  RequestBodyValidationError,
  expectBodyObject,
} from '../_shared/http/mod.ts'
import { ACADEMIC_REPORTS_MAX_COURSE_IDS } from './contract.ts'

export interface ListAcademicReportCoursesPayload {
  action: 'list_courses'
}

export interface GetAcademicGradesReportPayload {
  action: 'get_grades_report'
  courseIds: string[]
  includeSuspendedStudents: boolean
}

export interface GetAcademicPendingActivitiesReportPayload {
  action: 'get_pending_activities_report'
  courseIds: string[]
}

export type AcademicReportsPayload =
  | ListAcademicReportCoursesPayload
  | GetAcademicGradesReportPayload
  | GetAcademicPendingActivitiesReportPayload

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function invalid(field: string): never {
  throw new RequestBodyValidationError(`Invalid ${field}`, 422)
}

function ensureExactFields(body: Record<string, unknown>, allowedFields: string[]) {
  const allowed = new Set(allowedFields)
  if (Object.keys(body).some((field) => !allowed.has(field))) invalid('request fields')
}

function parseCourseIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > ACADEMIC_REPORTS_MAX_COURSE_IDS) {
    invalid('courseIds')
  }

  const courseIds = value.map((courseId) => {
    if (typeof courseId !== 'string' || !UUID_PATTERN.test(courseId)) invalid('courseIds')
    return courseId
  })

  if (new Set(courseIds).size !== courseIds.length) invalid('courseIds')
  return courseIds
}

export function parseAcademicReportsPayload(rawBody: unknown): AcademicReportsPayload {
  const body = expectBodyObject(rawBody)

  if (body.action === 'list_courses') {
    ensureExactFields(body, ['action'])
    return { action: 'list_courses' }
  }

  if (body.action === 'get_grades_report') {
    ensureExactFields(body, ['action', 'courseIds', 'includeSuspendedStudents'])
    if (typeof body.includeSuspendedStudents !== 'boolean') {
      invalid('includeSuspendedStudents')
    }
    return {
      action: 'get_grades_report',
      courseIds: parseCourseIds(body.courseIds),
      includeSuspendedStudents: body.includeSuspendedStudents,
    }
  }

  if (body.action === 'get_pending_activities_report') {
    ensureExactFields(body, ['action', 'courseIds'])
    return {
      action: 'get_pending_activities_report',
      courseIds: parseCourseIds(body.courseIds),
    }
  }

  invalid('action')
}
