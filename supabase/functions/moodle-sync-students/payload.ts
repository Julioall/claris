import {
  expectBodyObject,
  readRequiredMoodleUrl,
  readRequiredPositiveInteger,
  readRequiredString,
} from '../_shared/http/mod.ts'

export interface MoodleSyncStudentsPayload {
  courseId: number
  moodleUrl: string
  token: string
}

export function parseMoodleSyncStudentsPayload(rawBody: unknown): MoodleSyncStudentsPayload {
  const body = expectBodyObject(rawBody)

  return {
    courseId: readRequiredPositiveInteger(body, 'courseId'),
    moodleUrl: readRequiredMoodleUrl(body),
    token: readRequiredString(body, 'token'),
  }
}