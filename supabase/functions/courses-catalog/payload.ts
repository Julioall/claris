import {
  RequestBodyValidationError,
  expectBodyObject,
} from '../_shared/http/mod.ts'
import { validateUuid } from '../_shared/validation/mod.ts'
import {
  COURSE_ASSOCIATION_ROLES,
  COURSE_CATALOG_ACTIONS,
  COURSE_CATALOG_MAX_COURSE_IDS,
  type CourseAssociationRoleDto,
  type CourseCatalogAction,
} from './contract.ts'

export interface GetCourseCatalogPayload {
  action: 'get_catalog'
}

export interface SetCourseAssociationRolePayload {
  action: 'set_association_role'
  courseIds: string[]
  role: CourseAssociationRoleDto
}

export interface SetCoursesIgnoredPayload {
  action: 'set_ignored'
  courseIds: string[]
  ignored: boolean
}

export interface SetCourseAttendanceEnabledPayload {
  action: 'set_attendance_enabled'
  courseIds: string[]
  enabled: boolean
}

export type CourseCatalogPayload =
  | GetCourseCatalogPayload
  | SetCourseAssociationRolePayload
  | SetCoursesIgnoredPayload
  | SetCourseAttendanceEnabledPayload

const ALLOWED_FIELDS: Record<CourseCatalogAction, ReadonlySet<string>> = {
  get_catalog: new Set(['action']),
  set_association_role: new Set(['action', 'courseIds', 'role']),
  set_ignored: new Set(['action', 'courseIds', 'ignored']),
  set_attendance_enabled: new Set(['action', 'courseIds', 'enabled']),
}

const IDENTITY_FIELDS = new Set([
  'actorId',
  'actor_id',
  'p_user_id',
  'userId',
  'user_id',
])

function invalid(field: string, message = `Invalid ${field}`): never {
  throw new RequestBodyValidationError(message, 422)
}

function readAction(body: Record<string, unknown>): CourseCatalogAction {
  const action = body.action
  if (
    typeof action !== 'string'
    || !COURSE_CATALOG_ACTIONS.includes(action as CourseCatalogAction)
  ) {
    invalid('action')
  }
  return action as CourseCatalogAction
}

function assertAllowedFields(
  body: Record<string, unknown>,
  action: CourseCatalogAction,
): void {
  const fields = Object.keys(body)
  if (fields.some((field) => IDENTITY_FIELDS.has(field))) {
    invalid('request fields', 'Client-provided identity is not allowed')
  }
  if (fields.some((field) => !ALLOWED_FIELDS[action].has(field))) {
    invalid('request fields')
  }
}

function readCourseIds(body: Record<string, unknown>): string[] {
  const courseIds = body.courseIds
  if (
    !Array.isArray(courseIds)
    || courseIds.length === 0
    || courseIds.length > COURSE_CATALOG_MAX_COURSE_IDS
    || !courseIds.every(validateUuid)
  ) {
    invalid('courseIds')
  }

  const normalized = courseIds.map((courseId) => courseId.toLowerCase())
  if (new Set(normalized).size !== normalized.length) {
    invalid('courseIds', 'courseIds must contain unique UUIDs')
  }
  return normalized
}

function readBoolean(body: Record<string, unknown>, field: string): boolean {
  const value = body[field]
  if (typeof value !== 'boolean') invalid(field)
  return value
}

export function parseCourseCatalogPayload(rawBody: unknown): CourseCatalogPayload {
  const body = expectBodyObject(rawBody)
  const action = readAction(body)
  assertAllowedFields(body, action)

  if (action === 'get_catalog') return { action }

  const courseIds = readCourseIds(body)
  if (action === 'set_association_role') {
    const role = body.role
    if (
      typeof role !== 'string'
      || !COURSE_ASSOCIATION_ROLES.includes(role as CourseAssociationRoleDto)
    ) {
      invalid('role')
    }
    return { action, courseIds, role: role as CourseAssociationRoleDto }
  }

  if (action === 'set_ignored') {
    return { action, courseIds, ignored: readBoolean(body, 'ignored') }
  }

  return { action, courseIds, enabled: readBoolean(body, 'enabled') }
}
