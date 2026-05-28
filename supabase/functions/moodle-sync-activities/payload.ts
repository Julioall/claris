import {
  expectBodyObject,
  readOptionalPositiveInteger,
  readRequiredMoodleUrl,
  readRequiredPositiveInteger,
  readRequiredString,
} from '../_shared/http/mod.ts'

export interface MoodleSyncActivitiesPayload {
  courseId: number
  moodleUrl: string
  studentBatchPage?: number
  studentBatchSize?: number
  token: string
}

export function parseMoodleSyncActivitiesPayload(rawBody: unknown): MoodleSyncActivitiesPayload {
  const body = expectBodyObject(rawBody)

  return {
    courseId: readRequiredPositiveInteger(body, 'courseId'),
    moodleUrl: readRequiredMoodleUrl(body),
    studentBatchPage: readOptionalPositiveInteger(body, 'studentBatchPage'),
    studentBatchSize: readOptionalPositiveInteger(body, 'studentBatchSize'),
    token: readRequiredString(body, 'token'),
  }
}
