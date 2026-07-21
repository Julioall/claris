import {
  RequestBodyValidationError,
  expectBodyObject,
} from '../_shared/http/mod.ts'
import { validateUuid } from '../_shared/validation/mod.ts'
import type { MoodleSyncEntityDto } from './contract.ts'

const ACTIONS = [
  'list_available_courses',
  'start_initial_sync',
  'start_course_sync',
  'get_job',
  'list_active_jobs',
  'retry_job',
  'cancel_job',
  'get_preferences',
  'save_preferences',
  'get_course_student_counts',
  'recalculate_risk',
] as const

type Action = typeof ACTIONS[number]

export type MoodleSyncJobsPayload =
  | { action: 'list_available_courses' }
  | { action: 'start_initial_sync'; courseIds: string[] }
  | { action: 'start_course_sync'; courseIds: string[]; entities: MoodleSyncEntityDto[] }
  | { action: 'get_job'; jobId: string }
  | { action: 'list_active_jobs' }
  | { action: 'retry_job'; jobId: string }
  | { action: 'cancel_job'; jobId: string }
  | { action: 'get_preferences' }
  | {
      action: 'save_preferences'
      includeEmptyCourses: boolean
      includeFinished: boolean
      selectedKeys: string[]
    }
  | { action: 'get_course_student_counts'; courseIds: string[] }
  | { action: 'recalculate_risk'; courseIds: string[] }

const ALLOWED_FIELDS: Record<Action, ReadonlySet<string>> = {
  list_available_courses: new Set(['action']),
  start_initial_sync: new Set(['action', 'courseIds']),
  start_course_sync: new Set(['action', 'courseIds', 'entities']),
  get_job: new Set(['action', 'jobId']),
  list_active_jobs: new Set(['action']),
  retry_job: new Set(['action', 'jobId']),
  cancel_job: new Set(['action', 'jobId']),
  get_preferences: new Set(['action']),
  save_preferences: new Set(['action', 'includeEmptyCourses', 'includeFinished', 'selectedKeys']),
  get_course_student_counts: new Set(['action', 'courseIds']),
  recalculate_risk: new Set(['action', 'courseIds']),
}

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

function readAction(body: Record<string, unknown>): Action {
  if (typeof body.action !== 'string' || !ACTIONS.includes(body.action as Action)) {
    invalid('Invalid action')
  }
  return body.action as Action
}

function assertExactFields(body: Record<string, unknown>, action: Action): void {
  if (Object.keys(body).some((field) => !ALLOWED_FIELDS[action].has(field))) {
    invalid('Invalid request fields')
  }
}

function readUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !validateUuid(value)) invalid(`Invalid ${field}`)
  return value.toLowerCase()
}

function readCourseIds(body: Record<string, unknown>, max = 200): string[] {
  if (
    !Array.isArray(body.courseIds)
    || body.courseIds.length === 0
    || body.courseIds.length > max
  ) {
    invalid('Invalid courseIds')
  }
  const courseIds = body.courseIds.map((value) => readUuid(value, 'courseIds'))
  if (new Set(courseIds).size !== courseIds.length) invalid('courseIds must be unique')
  return courseIds
}

function readEntities(value: unknown): MoodleSyncEntityDto[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 3) {
    invalid('Invalid entities')
  }
  const entities = value.map((entity) => {
    if (entity !== 'students' && entity !== 'activities' && entity !== 'grades') {
      invalid('Invalid entities')
    }
    return entity
  })
  if (new Set(entities).size !== entities.length) invalid('entities must be unique')
  return entities
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') invalid(`Invalid ${field}`)
  return value
}

function readSelectedKeys(value: unknown): string[] {
  if (
    !Array.isArray(value)
    || value.length > 500
    || !value.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 300)
  ) {
    invalid('Invalid selectedKeys')
  }
  const keys = value.map((item) => item.trim())
  if (new Set(keys).size !== keys.length) invalid('selectedKeys must be unique')
  return keys
}

export function parseMoodleSyncJobsPayload(raw: unknown): MoodleSyncJobsPayload {
  const body = expectBodyObject(raw)
  const action = readAction(body)
  assertExactFields(body, action)

  switch (action) {
    case 'list_available_courses':
    case 'get_preferences':
    case 'list_active_jobs':
      return { action }
    case 'start_initial_sync':
    case 'get_course_student_counts':
    case 'recalculate_risk':
      return { action, courseIds: readCourseIds(body, action === 'start_initial_sync' ? 200 : 500) }
    case 'start_course_sync':
      return { action, courseIds: readCourseIds(body), entities: readEntities(body.entities) }
    case 'get_job':
    case 'retry_job':
    case 'cancel_job':
      return { action, jobId: readUuid(body.jobId, 'jobId') }
    case 'save_preferences':
      return {
        action,
        includeEmptyCourses: readBoolean(body.includeEmptyCourses, 'includeEmptyCourses'),
        includeFinished: readBoolean(body.includeFinished, 'includeFinished'),
        selectedKeys: readSelectedKeys(body.selectedKeys),
      }
  }
}
