import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import type { AppSupabaseClient } from '../_shared/db/mod.ts'
import {
  listExistingStudentActivityStatuses,
  listRecentlySyncedActivityStudentIds,
  listStudentIdsByCourseId,
  listStudentsWithMoodleUserId,
  type StudentActivityInsert,
  upsertStudentActivities,
} from '../_shared/domain/moodle-sync/repository.ts'
import { computeContentHash } from '../_shared/domain/moodle-sync/content-hash.ts'
import {
  loadActivityStaticSnapshot,
  type ActivityStaticItem,
  type ActivityStaticSnapshot,
} from '../_shared/domain/moodle-sync/activity-static-snapshot.ts'
import type { CourseSyncRecord } from '../_shared/domain/moodle-sync/repository.ts'
import type { MoodleAccess } from '../_shared/domain/moodle-connections/mod.ts'
import {
  callMoodleApi,
  combineMoodleApiTelemetry,
  type MoodleApiTelemetry,
} from '../_shared/moodle/mod.ts'
import { createMoodleSyncAttemptTelemetry } from '../_shared/domain/moodle-sync/attempt-telemetry.ts'
import {
  createMoodleProviderMetrics,
  toMoodleProviderMetricsMetadata,
} from '../_shared/domain/moodle-sync/provider-metrics.ts'

const COMPLETION_FETCH_POOL_SIZE = 4
const COMPLETION_REUSE_WINDOW_MINUTES = 10
const DEFAULT_STUDENT_BATCH_SIZE = 12
const MAX_STUDENT_BATCH_SIZE = 25
const MOODLE_BATCH_DELAY_MS = 300

export type { ActivityStaticSnapshot }

interface StudentBatchOptions {
  activityStaticSnapshot?: ActivityStaticSnapshot
  includeActivityStaticSnapshot?: boolean
  studentBatchPage?: number
  studentBatchSize?: number
  telemetry?: MoodleApiTelemetry
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function resolveStudentBatch(
  studentIds: string[],
  options: StudentBatchOptions = {},
) {
  const page = Math.max(1, options.studentBatchPage ?? 1)
  const batchSize = Math.min(
    MAX_STUDENT_BATCH_SIZE,
    Math.max(1, options.studentBatchSize ?? DEFAULT_STUDENT_BATCH_SIZE),
  )
  const start = (page - 1) * batchSize
  const selectedStudentIds = studentIds.slice(start, start + batchSize)
  const hasMore = start + selectedStudentIds.length < studentIds.length

  return {
    batchSize,
    hasMore,
    nextStudentBatchPage: hasMore ? page + 1 : null,
    page,
    selectedStudentIds,
    totalStudents: studentIds.length,
  }
}

export async function syncActivities(
  access: MoodleAccess,
  dbCourse: CourseSyncRecord,
  options: StudentBatchOptions = {},
): Promise<Response> {
  const supabase = createServiceClient()
  const courseId = Number.parseInt(dbCourse.moodle_course_id, 10)
  if (!Number.isSafeInteger(courseId) || courseId <= 0) {
    return errorResponse('Course has an invalid Moodle id', 409)
  }
  const moodleUrl = access.moodleUrl
  const token = access.token
  const providerMetrics = createMoodleProviderMetrics()
  const attemptTelemetry = combineMoodleApiTelemetry(
    options.telemetry ?? createMoodleSyncAttemptTelemetry({
      connectionId: access.connectionId,
      siteSlug: access.siteSlug,
    }),
    providerMetrics.telemetry(),
  )
  const callMoodleApiWithMetrics = (
    requestMoodleUrl: string,
    requestToken: string,
    operation: string,
    parameters: Record<string, string | number> = {},
  ) => providerMetrics.call(() => callMoodleApi(
    requestMoodleUrl,
    requestToken,
    operation,
    parameters,
    25_000,
    attemptTelemetry,
  ))

  const studentIds = await listStudentIdsByCourseId(supabase, dbCourse.id)
  if (studentIds.length === 0) {
    return jsonResponse({
      success: true,
      contractVersion: 2,
      connectionId: access.connectionId,
      siteSlug: access.siteSlug,
      activitiesCount: 0,
      hasMore: false,
      processedStudents: 0,
      totalStudents: 0,
      ...toMoodleProviderMetricsMetadata(providerMetrics.snapshot()),
    })
  }

  const studentBatch = resolveStudentBatch(studentIds, options)
  if (studentBatch.selectedStudentIds.length === 0) {
    return jsonResponse({
      success: true,
      contractVersion: 2,
      connectionId: access.connectionId,
      siteSlug: access.siteSlug,
      activitiesCount: 0,
      hasMore: false,
      nextStudentBatchPage: null,
      processedStudents: 0,
      totalStudents: studentBatch.totalStudents,
      ...toMoodleProviderMetricsMetadata(providerMetrics.snapshot()),
    })
  }

  const staticSnapshot = options.activityStaticSnapshot
    ?? await loadActivityStaticSnapshot(callMoodleApiWithMetrics, moodleUrl, token, courseId)
  const activities = staticSnapshot.activities
  console.log(`Found ${activities.length} activities (quiz/assign/forum) in course ${courseId}`)
  if (activities.length === 0) {
    return jsonResponse({
      success: true,
      contractVersion: 2,
      connectionId: access.connectionId,
      siteSlug: access.siteSlug,
      activitiesCount: 0,
      hasMore: false,
      nextStudentBatchPage: null,
      processedStudents: studentBatch.selectedStudentIds.length,
      totalStudents: studentBatch.totalStudents,
      ...toMoodleProviderMetricsMetadata(providerMetrics.snapshot()),
    })
  }

  // Fetch per-student completion status
  const completion = await fetchCompletionStatuses(
    moodleUrl,
    token,
    courseId,
    studentBatch.selectedStudentIds,
    dbCourse.id,
    supabase,
    callMoodleApiWithMetrics,
  )

  // Build and upsert records
  const now = new Date().toISOString()
  const activityRecords = await buildActivityRecords(
    activities,
    studentBatch.selectedStudentIds,
    dbCourse.id,
    completion.statuses,
    now,
    access.connectionId,
  )

  console.log(`Preparing to upsert ${activityRecords.length} activity records`)

  const BATCH_SIZE = 500
  const activitiesCount = await upsertStudentActivities(supabase, activityRecords, BATCH_SIZE)

  console.log(`Upserted ${activitiesCount} activity records`)
  return jsonResponse({
    success: completion.errorCount === 0,
    contractVersion: 2,
    connectionId: access.connectionId,
    siteSlug: access.siteSlug,
    activitiesCount,
    errorCount: completion.errorCount,
    hasMore: studentBatch.hasMore,
    ...(options.includeActivityStaticSnapshot && studentBatch.hasMore
      ? { activityStaticSnapshot: staticSnapshot }
      : {}),
    nextStudentBatchPage: studentBatch.nextStudentBatchPage,
    processedStudents: studentBatch.selectedStudentIds.length,
    studentBatchPage: studentBatch.page,
    studentBatchSize: studentBatch.batchSize,
    totalStudents: studentBatch.totalStudents,
    ...toMoodleProviderMetricsMetadata(providerMetrics.snapshot()),
  })
}

// --- Helper functions ---

async function buildActivityRecords(
  activities: ActivityStaticItem[],
  studentIds: string[],
  courseDbId: string,
  completionByStudent: Map<string, Map<string, { state: number; timecompleted: number | null }>>,
  now: string,
  connectionId: string,
): Promise<StudentActivityInsert[]> {
  const recordPromises: Promise<StudentActivityInsert>[] = []

  for (const activity of activities) {
    for (const studentId of studentIds) {
      const studentCompletion = completionByStudent.get(studentId)
      const actCompletion = studentCompletion?.get(String(activity.id))

      let status = 'pending'
      let completedAt: string | null = null

      if (actCompletion) {
        // Moodle completion states: 0=incomplete, 1=complete, 2=complete_pass, 3=complete_fail
        if (actCompletion.state >= 1) {
          status = actCompletion.state === 3 ? 'complete_fail' : 'completed'
          if (actCompletion.timecompleted && actCompletion.timecompleted > 0) {
            completedAt = new Date(actCompletion.timecompleted * 1000).toISOString()
          }
        }
      }

      const stableContent = {
        activity_name: activity.name,
        activity_type: activity.type,
        completed_at: completedAt,
        due_date: activity.dueDate,
        hidden: false,
        status,
      }
      recordPromises.push(computeContentHash(stableContent).then((contentHash) => ({
        student_id: studentId,
        course_id: courseDbId,
        moodle_activity_id: String(activity.id),
        ...stableContent,
        content_hash: contentHash,
        last_synced_connection_id: connectionId,
        observed_at: now,
        updated_at: now,
      })))
    }
  }

  return Promise.all(recordPromises)
}

/**
 * Fetch per-student completion statuses for all activities in a course.
 * Uses core_completion_get_activities_completion_status when available.
 */
async function fetchCompletionStatuses(
  moodleUrl: string,
  token: string,
  courseId: number,
  studentIds: string[],
  courseDbId: string,
  supabase: AppSupabaseClient,
  callApi: (
    moodleUrl: string,
    token: string,
    operation: string,
    parameters?: Record<string, string | number>,
  ) => Promise<unknown>,
): Promise<{
  errorCount: number
  statuses: Map<string, Map<string, { state: number; timecompleted: number | null }>>
}> {
  const result = new Map<string, Map<string, { state: number; timecompleted: number | null }>>()
  let errorCount = 0

  const students = await listStudentsWithMoodleUserId(supabase, studentIds)

  if (!students?.length) return { errorCount, statuses: result }

  const recentCompletionCutoffIso = new Date(
    Date.now() - (COMPLETION_REUSE_WINDOW_MINUTES * 60 * 1000),
  ).toISOString()

  let recentlySyncedStudentIds = new Set<string>()
  try {
    recentlySyncedStudentIds = await listRecentlySyncedActivityStudentIds(
      supabase,
      courseDbId,
      recentCompletionCutoffIso,
    )
  } catch (error) {
    console.warn('[moodle-sync-activities] Unable to load recent completion window. Continuing without delta optimization:', error)
  }

  const candidateCachedStudentIds = students
    .map((student) => student.id)
    .filter((studentId) => recentlySyncedStudentIds.has(studentId))
  const reusedStudentIds = new Set<string>()

  if (candidateCachedStudentIds.length > 0) {
    try {
      const cachedRows = await listExistingStudentActivityStatuses(
        supabase,
        courseDbId,
        candidateCachedStudentIds,
      )

      for (const row of cachedRows) {
        const existingMap = result.get(row.student_id) ?? new Map<string, { state: number; timecompleted: number | null }>()
        const status = row.status ?? 'pending'
        const state = status === 'complete_fail' ? 3 : status === 'completed' ? 1 : 0
        const timecompleted = row.completed_at
          ? Math.floor(new Date(row.completed_at).getTime() / 1000)
          : null

        existingMap.set(String(row.moodle_activity_id), { state, timecompleted })
        result.set(row.student_id, existingMap)
        reusedStudentIds.add(row.student_id)
      }
    } catch (error) {
      console.warn('[moodle-sync-activities] Failed to load cached completion statuses:', error)
    }
  }

  const studentsToFetch = students.filter(
    (student) => !reusedStudentIds.has(student.id),
  )

  if (reusedStudentIds.size > 0) {
    console.log(
      `[moodle-sync-activities] Reusing cached completion for ${reusedStudentIds.size} students (window=${COMPLETION_REUSE_WINDOW_MINUTES}min)`,
    )
  }

  for (let i = 0; i < studentsToFetch.length; i += COMPLETION_FETCH_POOL_SIZE) {
    const batch = studentsToFetch.slice(i, i + COMPLETION_FETCH_POOL_SIZE)

    const settled = await Promise.allSettled(
      batch.map(async (student) => {
        const moodleUserId = parseInt(student.moodle_user_id, 10)
        if (isNaN(moodleUserId)) {
          return { studentId: student.id, activityMap: new Map<string, { state: number; timecompleted: number | null }>() }
        }

        const completionData = await callApi(
          moodleUrl,
          token,
          'core_completion_get_activities_completion_status',
          { courseid: courseId, userid: moodleUserId },
        )

        const activityMap = new Map<string, { state: number; timecompleted: number | null }>()
        if (completionData?.statuses) {
          for (const s of completionData.statuses) {
            activityMap.set(String(s.cmid), {
              state: s.state ?? 0,
              timecompleted: s.timecompleted ?? null,
            })
          }
        }

        return { studentId: student.id, activityMap }
      })
    )

    for (const item of settled) {
      if (item.status === 'fulfilled') {
        result.set(item.value.studentId, item.value.activityMap)
      } else {
        errorCount += 1
      }
    }

    if (i + COMPLETION_FETCH_POOL_SIZE < studentsToFetch.length) {
      await wait(MOODLE_BATCH_DELAY_MS)
    }
  }

  return { errorCount, statuses: result }
}
