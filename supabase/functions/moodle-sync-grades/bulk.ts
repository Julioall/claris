import { MoodleApiError } from '../_shared/moodle/mod.ts'

export const MAX_BULK_GRADE_STUDENTS = 750
export const MAX_BULK_GRADE_REPORTS = 1_000
export const MAX_BULK_GRADE_ITEMS = 100_000

export interface GradeEnrollmentRef {
  moodle_user_id: string
  student_id: string
}

export interface MoodleUserGradeReport {
  gradeitems?: Array<Record<string, unknown>>
  userid?: unknown
}

export type BulkGradeFallbackReason =
  | 'ambiguous_response'
  | 'capability_denied'
  | 'enrollment_limit'
  | 'memory_limit'
  | 'response_limit'
  | 'unsupported_response'

export type BulkGradeFetchResult =
  | {
    mode: 'bulk'
    reportsByMoodleUserId: Map<string, MoodleUserGradeReport>
  }
  | {
    mode: 'individual'
    reason: BulkGradeFallbackReason
  }

type FetchGradeItems = (moodleUserId: number) => Promise<unknown>

class BulkGradeResponseError extends Error {
  constructor(readonly reason: Extract<
    BulkGradeFallbackReason,
    'ambiguous_response' | 'memory_limit' | 'unsupported_response'
  >) {
    super(`Moodle bulk grade response cannot be used (${reason}).`)
    this.name = 'BulkGradeResponseError'
  }
}

function readMoodleUserId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value)
  }

  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!/^\d+$/.test(normalized)) return null
  const numeric = Number(normalized)
  return Number.isSafeInteger(numeric) && numeric > 0 ? String(numeric) : null
}

function parseBulkPayload(payload: unknown): MoodleUserGradeReport[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new BulkGradeResponseError('unsupported_response')
  }

  const usergrades = (payload as { usergrades?: unknown }).usergrades
  if (!Array.isArray(usergrades)) {
    throw new BulkGradeResponseError('unsupported_response')
  }
  if (usergrades.length > MAX_BULK_GRADE_REPORTS) {
    throw new BulkGradeResponseError('memory_limit')
  }

  let gradeItemCount = 0
  const reports: MoodleUserGradeReport[] = []
  for (const value of usergrades) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BulkGradeResponseError('ambiguous_response')
    }

    const report = value as MoodleUserGradeReport
    if (report.gradeitems !== undefined && !Array.isArray(report.gradeitems)) {
      throw new BulkGradeResponseError('ambiguous_response')
    }
    gradeItemCount += report.gradeitems?.length ?? 0
    if (gradeItemCount > MAX_BULK_GRADE_ITEMS) {
      throw new BulkGradeResponseError('memory_limit')
    }
    reports.push(report)
  }

  return reports
}

function fallbackReasonForMoodleError(error: MoodleApiError): BulkGradeFallbackReason | null {
  if (error.category === 'response_too_large') return 'response_limit'
  if (error.category === 'permission') return 'capability_denied'
  if (error.category === 'invalid_payload') return 'unsupported_response'

  if (
    error.category === 'unknown'
    && /access|capabil|function|invalidrecord|notfound|permission|unsupported/i.test(error.code)
  ) {
    return 'capability_denied'
  }

  return null
}

/**
 * Tries the Moodle-supported all-users grade report (`userid=0`) once.
 *
 * A fallback is returned only when bulk is unsafe, unavailable, or ambiguous.
 * Authentication, throttling, network, and transient provider failures are
 * rethrown so they can be retried by the job instead of multiplying requests.
 */
export async function tryFetchBulkGradeReports(
  enrollments: GradeEnrollmentRef[],
  fetchGradeItems: FetchGradeItems,
): Promise<BulkGradeFetchResult> {
  if (enrollments.length > MAX_BULK_GRADE_STUDENTS) {
    return { mode: 'individual', reason: 'enrollment_limit' }
  }

  const expectedMoodleUserIds = new Set<string>()
  for (const enrollment of enrollments) {
    const moodleUserId = readMoodleUserId(enrollment.moodle_user_id)
    if (!moodleUserId || expectedMoodleUserIds.has(moodleUserId)) {
      return { mode: 'individual', reason: 'ambiguous_response' }
    }
    expectedMoodleUserIds.add(moodleUserId)
  }

  try {
    const reports = parseBulkPayload(await fetchGradeItems(0))
    const reportsByMoodleUserId = new Map<string, MoodleUserGradeReport>()

    for (const report of reports) {
      const moodleUserId = readMoodleUserId(report.userid)
      if (!moodleUserId || reportsByMoodleUserId.has(moodleUserId)) {
        return { mode: 'individual', reason: 'ambiguous_response' }
      }
      if (expectedMoodleUserIds.has(moodleUserId)) {
        reportsByMoodleUserId.set(moodleUserId, report)
      }
    }

    return { mode: 'bulk', reportsByMoodleUserId }
  } catch (error) {
    if (error instanceof BulkGradeResponseError) {
      return { mode: 'individual', reason: error.reason }
    }
    if (error instanceof MoodleApiError) {
      const reason = fallbackReasonForMoodleError(error)
      if (reason) return { mode: 'individual', reason }
    }
    throw error
  }
}
