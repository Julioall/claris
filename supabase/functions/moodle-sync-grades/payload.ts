import {
  expectBodyObject,
  readOptionalLiteral,
  readRequiredMoodleUrl,
  readRequiredPositiveInteger,
  readRequiredString,
} from '../_shared/http/mod.ts'

const GRADE_SYNC_ACTIONS = ['sync_grades', 'debug_grades'] as const

export interface SyncGradesPayload {
  action: 'sync_grades'
  courseId: number
  moodleUrl: string
  token: string
}

export interface DebugGradesPayload extends SyncGradesPayload {
  action: 'debug_grades'
  userId: number
}

export type MoodleSyncGradesPayload = SyncGradesPayload | DebugGradesPayload

export function parseMoodleSyncGradesPayload(rawBody: unknown): MoodleSyncGradesPayload {
  const body = expectBodyObject(rawBody)
  const action = readOptionalLiteral(body, 'action', GRADE_SYNC_ACTIONS) ?? 'sync_grades'

  const base = {
    action,
    courseId: readRequiredPositiveInteger(body, 'courseId'),
    moodleUrl: readRequiredMoodleUrl(body),
    token: readRequiredString(body, 'token'),
  }

  if (action === 'debug_grades') {
    return {
      ...base,
      action,
      userId: readRequiredPositiveInteger(body, 'userId'),
    }
  }

  return {
    ...base,
    action,
  }
}