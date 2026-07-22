import {
  RequestBodyValidationError,
  expectBodyObject,
  readRequiredUuid,
} from '../_shared/http/mod.ts'

export interface MoodleSyncStudentsPayload {
  connectionId: string
  courseId: string
}

export function parseMoodleSyncStudentsPayload(rawBody: unknown): MoodleSyncStudentsPayload {
  const body = expectBodyObject(rawBody)
  if (Object.keys(body).some((field) => !['connectionId', 'courseId'].includes(field))) {
    throw new RequestBodyValidationError('Invalid request fields', 422)
  }

  return {
    connectionId: readRequiredUuid(body, 'connectionId'),
    courseId: readRequiredUuid(body, 'courseId'),
  }
}
