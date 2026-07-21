import {
  RequestBodyValidationError,
  expectBodyObject,
} from '../_shared/http/mod.ts'
import { validateUuid } from '../_shared/validation/mod.ts'

export interface FindLatestRelevantGradeSuggestionJobPayload {
  action: 'find_latest_relevant'
  activityId: string
  courseId: string
}

export type GradeSuggestionJobsPayload = FindLatestRelevantGradeSuggestionJobPayload

const ALLOWED_FIELDS = new Set(['action', 'activityId', 'courseId'])
const IDENTITY_FIELDS = new Set(['actorId', 'actor_id', 'p_user_id', 'userId', 'user_id'])

function invalid(field: string, message = `Invalid ${field}`): never {
  throw new RequestBodyValidationError(message, 422)
}

function readUuid(value: unknown, field: string): string {
  if (!validateUuid(value)) invalid(field)
  return value.toLowerCase()
}

export function parseGradeSuggestionJobsPayload(rawBody: unknown): GradeSuggestionJobsPayload {
  const body = expectBodyObject(rawBody)

  if (Object.keys(body).some((field) => IDENTITY_FIELDS.has(field))) {
    invalid('request fields', 'Client-provided identity is not allowed')
  }
  if (Object.keys(body).some((field) => !ALLOWED_FIELDS.has(field))) {
    invalid('request fields')
  }
  if (body.action !== 'find_latest_relevant') invalid('action')

  return {
    action: 'find_latest_relevant',
    activityId: readUuid(body.activityId, 'activityId'),
    courseId: readUuid(body.courseId, 'courseId'),
  }
}
