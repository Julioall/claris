import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import {
  findCourseByMoodleCourseId,
  listRecentlySyncedGradeStudentIds,
  listCourseEnrollmentsWithMoodleUserId,
  type StudentActivityInsert,
  type StudentCourseGradeInsert,
  upsertStudentActivities,
  upsertStudentCourseGrades,
} from '../_shared/domain/moodle-sync/repository.ts'
import { refreshDashboardCourseActivityAggregates } from '../_shared/domain/dashboard-activity-aggregates.ts'
import { callMoodleApi } from '../_shared/moodle/mod.ts'
import {
  tryFetchBulkGradeReports,
  type BulkGradeFallbackReason,
  type GradeEnrollmentRef,
  type MoodleUserGradeReport,
} from './bulk.ts'
import { normalizeMoodleGradeReport } from './records.ts'

const GRADE_FETCH_POOL_SIZE = 4
const GRADE_SYNC_REUSE_WINDOW_MINUTES = 10
const DEFAULT_STUDENT_BATCH_SIZE = 10
const MAX_STUDENT_BATCH_SIZE = 25
const MOODLE_BATCH_DELAY_MS = 300

export interface GradeSyncOptions {
  connectionId: string
  moodleSiteId: string
  siteSlug: string
  studentBatchPage?: number
  studentBatchSize?: number
}

interface StudentBatch<TStudent> {
  batchSize: number
  hasMore: boolean
  nextStudentBatchPage: number | null
  page: number
  selectedStudents: TStudent[]
  totalStudents: number
}

interface GradeBatchResult {
  activityRecords: StudentActivityInsert[]
  courseGradeRecord: StudentCourseGradeInsert
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function resolveStudentBatch<TStudent>(
  students: TStudent[],
  options: Pick<GradeSyncOptions, 'studentBatchPage' | 'studentBatchSize'> = {},
): StudentBatch<TStudent> {
  const page = Math.max(1, options.studentBatchPage ?? 1)
  const batchSize = Math.min(
    MAX_STUDENT_BATCH_SIZE,
    Math.max(1, options.studentBatchSize ?? DEFAULT_STUDENT_BATCH_SIZE),
  )
  const start = (page - 1) * batchSize
  const selectedStudents = students.slice(start, start + batchSize)
  const hasMore = start + selectedStudents.length < students.length

  return {
    batchSize,
    hasMore,
    nextStudentBatchPage: hasMore ? page + 1 : null,
    page,
    selectedStudents,
    totalStudents: students.length,
  }
}

function normalizeResult(
  enrollment: GradeEnrollmentRef,
  report: MoodleUserGradeReport,
  clarisCourseId: string,
  syncedAt: string,
): GradeBatchResult {
  return normalizeMoodleGradeReport(report, {
    clarisCourseId,
    studentId: enrollment.student_id,
    syncedAt,
  })
}

async function fetchIndividualGradeReports(
  moodleUrl: string,
  token: string,
  courseId: number,
  enrollments: GradeEnrollmentRef[],
  clarisCourseId: string,
  syncedAt: string,
): Promise<{ errorCount: number; results: GradeBatchResult[] }> {
  const results: GradeBatchResult[] = []
  let errorCount = 0

  for (let i = 0; i < enrollments.length; i += GRADE_FETCH_POOL_SIZE) {
    const batch = enrollments.slice(i, i + GRADE_FETCH_POOL_SIZE)
    const settled = await Promise.allSettled(batch.map(async (enrollment) => {
      const moodleUserId = Number(enrollment.moodle_user_id)
      const payload = await callMoodleApi(
        moodleUrl,
        token,
        'gradereport_user_get_grade_items',
        { courseid: courseId, userid: moodleUserId },
      )
      const usergrades = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as { usergrades?: unknown }).usergrades
        : undefined
      const report = Array.isArray(usergrades) && usergrades[0]
      if (!report || typeof report !== 'object' || Array.isArray(report)) {
        throw new Error('Moodle returned an invalid individual grade report.')
      }
      return normalizeResult(
        enrollment,
        report as MoodleUserGradeReport,
        clarisCourseId,
        syncedAt,
      )
    }))

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        errorCount += 1
        console.error('[moodle-sync-grades] Individual grade fetch failed.', {
          errorType: result.reason instanceof Error ? result.reason.name : 'unknown',
          moodleCourseId: courseId,
        })
      }
    }

    if (i + GRADE_FETCH_POOL_SIZE < enrollments.length) {
      await wait(MOODLE_BATCH_DELAY_MS)
    }
  }

  return { errorCount, results }
}

export async function syncGrades(
  moodleUrl: string,
  token: string,
  courseId: number,
  options: GradeSyncOptions,
): Promise<Response> {
  const supabase = createServiceClient()
  const gradesCourse = await findCourseByMoodleCourseId(
    supabase,
    options.moodleSiteId,
    String(courseId),
  )
  if (!gradesCourse) return errorResponse('Course not found in database', 404)

  const enrolledStudents = await listCourseEnrollmentsWithMoodleUserId(supabase, gradesCourse.id)
  if (!enrolledStudents.length) {
    await refreshDashboardAggregatesForCourse(supabase, gradesCourse.id)
    return jsonResponse({
      success: true,
      contractVersion: 2,
      connectionId: options.connectionId,
      siteSlug: options.siteSlug,
      gradesCount: 0,
      activityGradesCount: 0,
      errorCount: 0,
      fetchMode: 'bulk',
      hasMore: false,
      processedStudents: 0,
      skippedStudents: 0,
      totalStudents: 0,
    })
  }

  const recentSyncCutoffIso = new Date(
    Date.now() - (GRADE_SYNC_REUSE_WINDOW_MINUTES * 60 * 1_000),
  ).toISOString()
  let recentlySyncedStudentIds = new Set<string>()
  try {
    recentlySyncedStudentIds = await listRecentlySyncedGradeStudentIds(
      supabase,
      gradesCourse.id,
      recentSyncCutoffIso,
    )
  } catch (error) {
    console.warn('[moodle-sync-grades] Recent sync window is unavailable.', {
      errorType: error instanceof Error ? error.name : 'unknown',
    })
  }

  const allStudentsToFetch = enrolledStudents.filter(
    (enrollment) => !recentlySyncedStudentIds.has(enrollment.student_id),
  )
  if (allStudentsToFetch.length === 0) {
    await refreshDashboardAggregatesForCourse(supabase, gradesCourse.id)
    return jsonResponse({
      success: true,
      contractVersion: 2,
      connectionId: options.connectionId,
      siteSlug: options.siteSlug,
      gradesCount: 0,
      activityGradesCount: 0,
      errorCount: 0,
      fetchMode: 'cache',
      hasMore: false,
      nextStudentBatchPage: null,
      processedStudents: enrolledStudents.length,
      skippedStudents: enrolledStudents.length,
      studentBatchPage: 1,
      studentBatchSize: enrolledStudents.length,
      totalStudents: enrolledStudents.length,
    })
  }

  const fetchGradeItems = (moodleUserId: number) => callMoodleApi(
    moodleUrl,
    token,
    'gradereport_user_get_grade_items',
    { courseid: courseId, userid: moodleUserId },
  )

  const requestedPage = Math.max(1, options.studentBatchPage ?? 1)
  let fallbackReason: BulkGradeFallbackReason | 'continuation_page' | null = null
  let results: GradeBatchResult[] = []
  let errorCount = 0
  let page: StudentBatch<GradeEnrollmentRef>

  // Page > 1 can only be a continuation of an already selected individual
  // fallback. Avoid retrying a known-incompatible bulk request on every page.
  if (requestedPage === 1) {
    const bulk = await tryFetchBulkGradeReports(enrolledStudents, fetchGradeItems)
    if (bulk.mode === 'bulk') {
      const now = new Date().toISOString()
      results = allStudentsToFetch.flatMap((enrollment) => {
        const report = bulk.reportsByMoodleUserId.get(String(Number(enrollment.moodle_user_id)))
        return report ? [normalizeResult(enrollment, report, gradesCourse.id, now)] : []
      })
      page = {
        batchSize: enrolledStudents.length,
        hasMore: false,
        nextStudentBatchPage: null,
        page: 1,
        selectedStudents: enrolledStudents,
        totalStudents: enrolledStudents.length,
      }
    } else {
      fallbackReason = bulk.reason
      page = resolveStudentBatch(enrolledStudents, options)
    }
  } else {
    fallbackReason = 'continuation_page'
    page = resolveStudentBatch(enrolledStudents, options)
  }

  if (fallbackReason) {
    const studentsToFetch = page.selectedStudents.filter(
      (enrollment) => !recentlySyncedStudentIds.has(enrollment.student_id),
    )
    const individual = await fetchIndividualGradeReports(
      moodleUrl,
      token,
      courseId,
      studentsToFetch,
      gradesCourse.id,
      new Date().toISOString(),
    )
    results = individual.results
    errorCount = individual.errorCount
  }

  const activityGradeRecords = results.flatMap((result) => result.activityRecords)
  const courseGradeRecords = results.map((result) => result.courseGradeRecord)

  let activityGradesCount = 0
  if (activityGradeRecords.length > 0) {
    activityGradesCount = await upsertStudentActivities(supabase, activityGradeRecords, 200)
  }

  let gradesCount = 0
  if (courseGradeRecords.length > 0) {
    gradesCount = await upsertStudentCourseGrades(supabase, courseGradeRecords, 100)
  }

  if (!page.hasMore) {
    await refreshDashboardAggregatesForCourse(supabase, gradesCourse.id)
  }

  const skippedStudents = page.selectedStudents.filter(
    (enrollment) => recentlySyncedStudentIds.has(enrollment.student_id),
  ).length
  const unmatchedStudents = fallbackReason
    ? 0
    : allStudentsToFetch.length - results.length
  return jsonResponse({
    success: errorCount === 0,
    contractVersion: 2,
    connectionId: options.connectionId,
    siteSlug: options.siteSlug,
    gradesCount,
    activityGradesCount,
    errorCount,
    fetchMode: fallbackReason ? 'individual' : 'bulk',
    fallbackReason,
    hasMore: page.hasMore,
    nextStudentBatchPage: page.nextStudentBatchPage,
    processedStudents: page.selectedStudents.length,
    skippedStudents,
    unmatchedStudents,
    studentBatchPage: page.page,
    studentBatchSize: page.batchSize,
    totalStudents: page.totalStudents,
  })
}

async function refreshDashboardAggregatesForCourse(
  supabase: ReturnType<typeof createServiceClient>,
  courseId: string,
) {
  try {
    await refreshDashboardCourseActivityAggregates(supabase, [courseId])
  } catch (error) {
    console.error('[moodle-sync-grades] Dashboard aggregate refresh failed.', {
      errorType: error instanceof Error ? error.name : 'unknown',
    })
  }
}
