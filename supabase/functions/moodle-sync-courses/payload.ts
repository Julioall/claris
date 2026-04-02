import {
  expectBodyObject,
  readOptionalLiteral,
  readRequiredMoodleUrl,
  readRequiredPositiveInteger,
  readRequiredString,
  readRequiredStringArray,
} from '../_shared/http/mod.ts'

const COURSE_SYNC_ACTIONS = ['sync_courses', 'link_selected_courses', 'sync_project_catalog'] as const

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

export interface SyncProjectCatalogPayload {
  action: 'sync_project_catalog'
  moodleUrl: string
  token: string
}

export type MoodleSyncCoursesPayload = SyncCoursesPayload | LinkSelectedCoursesPayload | SyncProjectCatalogPayload

export function parseMoodleSyncCoursesPayload(rawBody: unknown): MoodleSyncCoursesPayload {
  const body = expectBodyObject(rawBody)
  const action = readOptionalLiteral(body, 'action', COURSE_SYNC_ACTIONS) ?? 'sync_courses'

  if (action === 'link_selected_courses') {
    return {
      action,
      selectedCourseIds: readRequiredStringArray(body, 'selectedCourseIds'),
    }
  }

  if (action === 'sync_project_catalog') {
    return {
      action,
      moodleUrl: readRequiredMoodleUrl(body),
      token: readRequiredString(body, 'token'),
    }
  }

  return {
    action,
    moodleUrl: readRequiredMoodleUrl(body),
    token: readRequiredString(body, 'token'),
    userId: String(readRequiredPositiveInteger(body, 'userId')),
  }
}