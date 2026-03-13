import {
  expectBodyObject,
  readRequiredMoodleUrl,
  readRequiredPositiveInteger,
  readRequiredString,
} from '../_shared/http/mod.ts'

export interface MoodleSyncActivitiesPayload {
  courseId: number
  moodleUrl: string
  token: string
}

export function parseMoodleSyncActivitiesPayload(rawBody: unknown): MoodleSyncActivitiesPayload {
  const body = expectBodyObject(rawBody)

  return {
    courseId: readRequiredPositiveInteger(body, 'courseId'),
    moodleUrl: readRequiredMoodleUrl(body),
    token: readRequiredString(body, 'token'),
  }
}