import {
  RequestBodyValidationError,
  expectBodyObject,
  readOptionalPositiveInteger,
  readRequiredUuid,
} from '../_shared/http/mod.ts'

export interface MoodleSyncActivitiesPayload {
  connectionId: string
  courseId: string
  studentBatchPage?: number
  studentBatchSize?: number
}

export function parseMoodleSyncActivitiesPayload(rawBody: unknown): MoodleSyncActivitiesPayload {
  const body = expectBodyObject(rawBody)
  if (Object.keys(body).some((field) => ![
    'connectionId',
    'courseId',
    'studentBatchPage',
    'studentBatchSize',
  ].includes(field))) {
    throw new RequestBodyValidationError('Invalid request fields', 422)
  }

  return {
    connectionId: readRequiredUuid(body, 'connectionId'),
    courseId: readRequiredUuid(body, 'courseId'),
    studentBatchPage: readOptionalPositiveInteger(body, 'studentBatchPage'),
    studentBatchSize: readOptionalPositiveInteger(body, 'studentBatchSize'),
  }
}
