import { RequestBodyValidationError, expectBodyObject } from '../_shared/http/mod.ts'
import { validateUuid } from '../_shared/validation/mod.ts'
import type { MoodleSnapshotEntity } from './contract.ts'

export type MoodleCourseSnapshotPayload =
  | {
      action: 'get_course_snapshot'
      connectionId: string
      courseId: string
      entities: MoodleSnapshotEntity[]
      refreshPolicy: 'never' | 'if_stale'
    }
  | {
      action: 'request_course_refresh'
      connectionId: string
      courseId: string
      entities: MoodleSnapshotEntity[]
      reason: 'manual'
    }

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !validateUuid(value)) invalid(`Invalid ${field}`)
  return value.toLowerCase()
}

function entities(value: unknown): MoodleSnapshotEntity[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 3) {
    invalid('Invalid entities')
  }
  const parsed = value.map((entry) => {
    if (entry !== 'students' && entry !== 'activities' && entry !== 'grades') {
      invalid('Invalid entities')
    }
    return entry
  })
  if (new Set(parsed).size !== parsed.length) invalid('entities must be unique')
  return parsed.sort()
}

export function parseMoodleCourseSnapshotPayload(raw: unknown): MoodleCourseSnapshotPayload {
  const body = expectBodyObject(raw)
  if (body.action === 'get_course_snapshot') {
    const allowed = new Set(['action', 'connectionId', 'courseId', 'entities', 'refreshPolicy'])
    if (Object.keys(body).some((key) => !allowed.has(key))) invalid('Invalid request fields')
    if (body.refreshPolicy !== 'never' && body.refreshPolicy !== 'if_stale') {
      invalid('Invalid refreshPolicy')
    }
    return {
      action: body.action,
      connectionId: uuid(body.connectionId, 'connectionId'),
      courseId: uuid(body.courseId, 'courseId'),
      entities: entities(body.entities),
      refreshPolicy: body.refreshPolicy,
    }
  }
  if (body.action === 'request_course_refresh') {
    const allowed = new Set(['action', 'connectionId', 'courseId', 'entities', 'reason'])
    if (Object.keys(body).some((key) => !allowed.has(key))) invalid('Invalid request fields')
    if (body.reason !== 'manual') invalid('Invalid reason')
    return {
      action: body.action,
      connectionId: uuid(body.connectionId, 'connectionId'),
      courseId: uuid(body.courseId, 'courseId'),
      entities: entities(body.entities),
      reason: body.reason,
    }
  }
  return invalid('Invalid action')
}

