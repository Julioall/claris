import {
  RequestBodyValidationError,
  expectBodyObject,
  readOptionalLiteral,
  readOptionalPositiveInteger,
  readRequiredUuid,
} from '../_shared/http/mod.ts'

const GRADE_SYNC_ACTIONS = ['sync_grades'] as const

export interface SyncGradesPayload {
  action: 'sync_grades'
  connectionId: string
  courseId: string
  studentBatchPage?: number
  studentBatchSize?: number
}

export type MoodleSyncGradesPayload = SyncGradesPayload

export function parseMoodleSyncGradesPayload(rawBody: unknown): MoodleSyncGradesPayload {
  const body = expectBodyObject(rawBody)
  const action = readOptionalLiteral(body, 'action', GRADE_SYNC_ACTIONS) ?? 'sync_grades'
  const allowedFields = new Set([
    'action',
    'connectionId',
    'courseId',
    'studentBatchPage',
    'studentBatchSize',
  ])
  if (Object.keys(body).some((field) => !allowedFields.has(field))) {
    throw new RequestBodyValidationError('Invalid request fields', 422)
  }

  return {
    action,
    connectionId: readRequiredUuid(body, 'connectionId'),
    courseId: readRequiredUuid(body, 'courseId'),
    studentBatchPage: readOptionalPositiveInteger(body, 'studentBatchPage'),
    studentBatchSize: readOptionalPositiveInteger(body, 'studentBatchSize'),
  }
}
