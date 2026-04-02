import {
  expectBodyObject,
  readOptionalLiteral,
  readRequiredMoodleUrl,
  readRequiredPositiveInteger,
  readRequiredString,
  readRequiredStringArray,
} from '../_shared/http/mod.ts'

const COURSE_SYNC_ACTIONS = ['sync_courses', 'link_selected_courses', 'sync_project_catalog', 'list_moodle_categories'] as const

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
  categoryIds?: number[]
}

export interface ListMoodleCategoriesPayload {
  action: 'list_moodle_categories'
  moodleUrl: string
  token: string
}

export type MoodleSyncCoursesPayload = SyncCoursesPayload | LinkSelectedCoursesPayload | SyncProjectCatalogPayload | ListMoodleCategoriesPayload

export function parseMoodleSyncCoursesPayload(rawBody: unknown): MoodleSyncCoursesPayload {
  const body = expectBodyObject(rawBody)
  const action = readOptionalLiteral(body, 'action', COURSE_SYNC_ACTIONS) ?? 'sync_courses'

  if (action === 'link_selected_courses') {
    return {
      action,
      selectedCourseIds: readRequiredStringArray(body, 'selectedCourseIds'),
    }
  }

  if (action === 'list_moodle_categories') {
    return {
      action,
      moodleUrl: readRequiredMoodleUrl(body),
      token: readRequiredString(body, 'token'),
    }
  }

  if (action === 'sync_project_catalog') {
    const rawIds = Array.isArray(body['categoryIds']) ? body['categoryIds'] : undefined
    const categoryIds = rawIds?.filter((v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
    return {
      action,
      moodleUrl: readRequiredMoodleUrl(body),
      token: readRequiredString(body, 'token'),
      categoryIds: categoryIds && categoryIds.length > 0 ? categoryIds : undefined,
    }
  }

  return {
    action,
    moodleUrl: readRequiredMoodleUrl(body),
    token: readRequiredString(body, 'token'),
    userId: String(readRequiredPositiveInteger(body, 'userId')),
  }
}