import { createServiceClient } from '../_shared/db/mod.ts'
import { resolveMoodleAccess, scheduleMoodleSyncJob } from '../_shared/domain/moodle-sync/job-runner.ts'
import { recalculateRiskForCourses } from '../_shared/domain/risk/recalculation.ts'
import { syncCourses } from '../moodle-sync-courses/service.ts'
import type { MoodleSyncCourseDto } from './contract.ts'
import type { MoodleSyncJobsRuntime } from './service.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  let payload: Record<string, unknown> = {}
  try {
    const parsed = await response.json()
    if (isRecord(parsed)) payload = parsed
  } catch {
    payload = {}
  }
  if (!response.ok || typeof payload.error === 'string') {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Failed to sync Moodle courses')
  }
  return payload
}

function mapAvailableCourse(value: unknown): MoodleSyncCourseDto | null {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.moodle_course_id !== 'string'
    || typeof value.name !== 'string'
  ) {
    return null
  }
  return {
    category: nullableString(value.category),
    createdAt: nullableString(value.created_at),
    endsAt: nullableString(value.end_date),
    id: value.id,
    lastSynchronizedAt: nullableString(value.last_sync),
    moodleCourseId: value.moodle_course_id,
    name: value.name,
    shortName: nullableString(value.short_name),
    startsAt: nullableString(value.start_date),
    updatedAt: nullableString(value.updated_at),
  }
}

export const moodleSyncJobsRuntime: MoodleSyncJobsRuntime = {
  async listAvailableCourses(actorId, connectionId) {
    const supabase = createServiceClient()
    const access = await resolveMoodleAccess(supabase, actorId, connectionId)
    const payload = await parseResponse(await syncCourses(access, { autoLinkTutorCourses: false }))
    return (Array.isArray(payload.courses) ? payload.courses : [])
      .map(mapAvailableCourse)
      .filter((course): course is MoodleSyncCourseDto => Boolean(course))
  },

  async recalculateRisk(_actorId, courseIds) {
    return await recalculateRiskForCourses(createServiceClient(), courseIds)
  },

  schedule: scheduleMoodleSyncJob,
}
