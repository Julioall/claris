import {
  expectBodyObject,
  readOptionalLiteral,
  readRequiredMoodleUrl,
  readRequiredPositiveInteger,
  readRequiredString,
  readRequiredStringArray,
} from '../_shared/http/mod.ts'

const COURSE_SYNC_ACTIONS = ['sync_courses', 'link_selected_courses'] as const

type CourseSyncAction = typeof COURSE_SYNC_ACTIONS[number]

export interface SyncCoursesPayload {
  action: 'sync_courses'
  moodleUrl: string
  token: string
  userId: string
}

export interface LinkSelectedCoursesPayload {
  action: 'link_selected_courses'
  selectedCourseIds: string[]
}

export type MoodleSyncCoursesPayload = SyncCoursesPayload | LinkSelectedCoursesPayload

export function parseMoodleSyncCoursesPayload(rawBody: unknown): MoodleSyncCoursesPayload {
  const body = expectBodyObject(rawBody)
  const action = readOptionalLiteral(body, 'action', COURSE_SYNC_ACTIONS) ?? 'sync_courses'

  if (action === 'link_selected_courses') {
    return {
      action,
      selectedCourseIds: readRequiredStringArray(body, 'selectedCourseIds'),
    }
  }

  return {
    action,
    moodleUrl: readRequiredMoodleUrl(body),
    token: readRequiredString(body, 'token'),
    userId: String(readRequiredPositiveInteger(body, 'userId')),
  }
}