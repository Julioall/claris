import {
  RequestBodyValidationError,
  expectBodyObject,
  readOptionalLiteral,
  readOptionalPositiveInteger,
  readRequiredMoodleUrl,
  readRequiredPositiveInteger,
  readRequiredString,
} from '../_shared/http/mod.ts'

const GRADE_SYNC_ACTIONS = ['sync_grades'] as const

export interface SyncGradesPayload {
  action: 'sync_grades'
  courseId: number
  moodleUrl: string
  studentBatchPage?: number
  studentBatchSize?: number
  token: string
}

export type MoodleSyncGradesPayload = SyncGradesPayload

export function parseMoodleSyncGradesPayload(rawBody: unknown): MoodleSyncGradesPayload {
  const body = expectBodyObject(rawBody)
  const action = readOptionalLiteral(body, 'action', GRADE_SYNC_ACTIONS) ?? 'sync_grades'
  const allowedFields = new Set([
    'action',
    'courseId',
    'moodleUrl',
    'studentBatchPage',
    'studentBatchSize',
    'token',
  ])
  if (Object.keys(body).some((field) => !allowedFields.has(field))) {
    throw new RequestBodyValidationError('Invalid request fields', 422)
  }

  return {
    action,
    courseId: readRequiredPositiveInteger(body, 'courseId'),
    moodleUrl: readRequiredMoodleUrl(body),
    studentBatchPage: readOptionalPositiveInteger(body, 'studentBatchPage'),
    studentBatchSize: readOptionalPositiveInteger(body, 'studentBatchSize'),
    token: readRequiredString(body, 'token'),
  }
}
