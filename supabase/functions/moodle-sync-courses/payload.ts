import {
  RequestBodyValidationError,
  expectBodyObject,
  readRequiredUuid,
} from '../_shared/http/mod.ts'
import { validateUuid } from '../_shared/validation/mod.ts'

const COURSE_SYNC_ACTIONS = ['sync_courses', 'link_selected_courses'] as const
const MAX_SELECTED_COURSE_IDS = 500

type CourseSyncAction = typeof COURSE_SYNC_ACTIONS[number]

const ALLOWED_FIELDS: Record<CourseSyncAction, ReadonlySet<string>> = {
  sync_courses: new Set(['action', 'connectionId']),
  link_selected_courses: new Set(['action', 'connectionId', 'selectedCourseIds']),
}

export interface SyncCoursesPayload {
  action: 'sync_courses'
  connectionId: string
}

export interface LinkSelectedCoursesPayload {
  action: 'link_selected_courses'
  connectionId: string
  selectedCourseIds: string[]
}

export type MoodleSyncCoursesPayload = SyncCoursesPayload | LinkSelectedCoursesPayload

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

function readAction(body: Record<string, unknown>): CourseSyncAction {
  const action = body.action ?? 'sync_courses'
  if (
    typeof action !== 'string'
    || !COURSE_SYNC_ACTIONS.includes(action as CourseSyncAction)
  ) {
    invalid('Invalid action')
  }
  return action as CourseSyncAction
}

function assertAllowedFields(
  body: Record<string, unknown>,
  action: CourseSyncAction,
): void {
  if (Object.keys(body).some((field) => !ALLOWED_FIELDS[action].has(field))) {
    invalid('Invalid request fields')
  }
}

function readSelectedCourseIds(body: Record<string, unknown>): string[] {
  const courseIds = body.selectedCourseIds
  if (
    !Array.isArray(courseIds)
    || courseIds.length === 0
    || courseIds.length > MAX_SELECTED_COURSE_IDS
    || !courseIds.every(validateUuid)
  ) {
    invalid('Invalid selectedCourseIds')
  }

  const normalized = courseIds.map((courseId) => courseId.toLowerCase())
  if (new Set(normalized).size !== normalized.length) {
    invalid('selectedCourseIds must contain unique UUIDs')
  }
  return normalized
}

export function parseMoodleSyncCoursesPayload(rawBody: unknown): MoodleSyncCoursesPayload {
  const body = expectBodyObject(rawBody)
  const action = readAction(body)
  assertAllowedFields(body, action)

  if (action === 'link_selected_courses') {
    return {
      action,
      connectionId: readRequiredUuid(body, 'connectionId'),
      selectedCourseIds: readSelectedCourseIds(body),
    }
  }

  return {
    action,
    connectionId: readRequiredUuid(body, 'connectionId'),
  }
}
