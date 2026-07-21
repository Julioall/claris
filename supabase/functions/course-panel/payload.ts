import {
  RequestBodyValidationError,
  expectBodyObject,
} from '../_shared/http/mod.ts'

export interface GetCoursePanelPayload {
  action: 'get_panel'
  courseId: string
}

export interface SetCourseActivityVisibilityPayload {
  action: 'set_activity_visibility'
  courseId: string
  hidden: boolean
  moodleActivityId: string
}

export type CoursePanelPayload =
  | GetCoursePanelPayload
  | SetCourseActivityVisibilityPayload

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_MOODLE_ACTIVITY_ID_LENGTH = 255

function invalid(field: string): never {
  throw new RequestBodyValidationError(`Invalid ${field}`, 422)
}

function ensureExactFields(body: Record<string, unknown>, allowedFields: string[]) {
  const allowed = new Set(allowedFields)
  if (Object.keys(body).some((field) => !allowed.has(field))) invalid('request fields')
}

function parseCourseId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) invalid('courseId')
  return value
}

function parseMoodleActivityId(value: unknown): string {
  if (typeof value !== 'string') invalid('moodleActivityId')
  const normalized = value.trim()
  if (!normalized || normalized.length > MAX_MOODLE_ACTIVITY_ID_LENGTH) {
    invalid('moodleActivityId')
  }
  return normalized
}

export function parseCoursePanelPayload(rawBody: unknown): CoursePanelPayload {
  const body = expectBodyObject(rawBody)

  if (body.action === 'get_panel') {
    ensureExactFields(body, ['action', 'courseId'])
    return {
      action: 'get_panel',
      courseId: parseCourseId(body.courseId),
    }
  }

  if (body.action === 'set_activity_visibility') {
    ensureExactFields(body, ['action', 'courseId', 'moodleActivityId', 'hidden'])
    if (typeof body.hidden !== 'boolean') invalid('hidden')
    return {
      action: 'set_activity_visibility',
      courseId: parseCourseId(body.courseId),
      hidden: body.hidden,
      moodleActivityId: parseMoodleActivityId(body.moodleActivityId),
    }
  }

  invalid('action')
}
