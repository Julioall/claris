import type { AppSupabaseClient } from '../../db/mod.ts'

const DEADLOCK_ERROR_CODE = '40P01'
const DEADLOCK_RETRY_LIMIT = 2
const DEADLOCK_RETRY_DELAY_MS = 150

interface DatabaseError {
  code?: string | null
  message?: string | null
}

export interface RiskRecalculationResult {
  failedCount: number
  missingRpc: boolean
  updatedCount: number
  usedFallback: boolean
}

function isMissingRpcError(error: DatabaseError | null): boolean {
  return Boolean(error) && (
    error?.code === 'PGRST202'
    || error?.message?.toLowerCase().includes('could not find the function') === true
  )
}

function isDeadlockError(error: DatabaseError | null): boolean {
  return Boolean(error) && (
    error?.code === DEADLOCK_ERROR_CODE
    || error?.message?.toLowerCase().includes('deadlock detected') === true
  )
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runWithDeadlockRetry<T>(
  operation: () => Promise<{ data: T | null; error: DatabaseError | null }>,
): Promise<{ data: T | null; error: DatabaseError | null }> {
  for (let attempt = 0; attempt <= DEADLOCK_RETRY_LIMIT; attempt += 1) {
    const result = await operation()
    if (!isDeadlockError(result.error) || attempt === DEADLOCK_RETRY_LIMIT) {
      return result
    }
    await wait(DEADLOCK_RETRY_DELAY_MS * (attempt + 1))
  }

  throw new Error('Unreachable deadlock retry state')
}

async function recalculateByCourse(
  supabase: AppSupabaseClient,
  courseIds: string[],
): Promise<Omit<RiskRecalculationResult, 'usedFallback'>> {
  let failedCount = 0
  let updatedCount = 0

  for (const courseId of courseIds) {
    const result = await runWithDeadlockRetry(() => supabase.rpc(
      'update_course_students_risk',
      { p_course_id: courseId },
    ) as unknown as Promise<{ data: number | null; error: DatabaseError | null }>)

    if (isMissingRpcError(result.error)) {
      return { failedCount, missingRpc: true, updatedCount }
    }
    if (result.error) {
      failedCount += 1
      continue
    }
    updatedCount += result.data ?? 0
  }

  return { failedCount, missingRpc: false, updatedCount }
}

async function recalculateByStudent(
  supabase: AppSupabaseClient,
  courseIds: string[],
): Promise<Omit<RiskRecalculationResult, 'usedFallback'>> {
  const { data, error } = await supabase
    .from('student_courses')
    .select('student_id')
    .in('course_id', courseIds)

  if (error) throw error

  const studentIds = [...new Set((data ?? []).map((row) => row.student_id))]
  let failedCount = 0
  let updatedCount = 0

  for (const studentId of studentIds) {
    const result = await runWithDeadlockRetry(() => supabase.rpc(
      'update_student_risk',
      { p_student_id: studentId },
    ) as unknown as Promise<{ data: unknown | null; error: DatabaseError | null }>)

    if (isMissingRpcError(result.error)) {
      return { failedCount, missingRpc: true, updatedCount }
    }
    if (result.error) {
      failedCount += 1
      continue
    }
    updatedCount += 1
  }

  return { failedCount, missingRpc: false, updatedCount }
}

export async function recalculateRiskForCourses(
  supabase: AppSupabaseClient,
  courseIds: string[],
): Promise<RiskRecalculationResult> {
  const uniqueCourseIds = [...new Set(courseIds)]
  if (uniqueCourseIds.length === 0) {
    return { failedCount: 0, missingRpc: false, updatedCount: 0, usedFallback: false }
  }

  const courseResult = await recalculateByCourse(supabase, uniqueCourseIds)
  if (!courseResult.missingRpc) {
    return { ...courseResult, usedFallback: false }
  }

  return {
    ...await recalculateByStudent(supabase, uniqueCourseIds),
    usedFallback: true,
  }
}
