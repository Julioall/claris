import { supabase } from '@/integrations/supabase/client';

import type { RiskUpdateResult } from '../domain/sync';

const DEADLOCK_ERROR_CODE = '40P01';
const DEADLOCK_RETRY_LIMIT = 2;
const DEADLOCK_RETRY_DELAY_MS = 150;

function isMissingRpcError(error: { code?: string | null; message?: string | null } | null): boolean {
  return Boolean(error) && (
    error?.code === 'PGRST202' ||
    error?.message?.toLowerCase().includes('could not find the function') === true
  );
}

function isDeadlockError(error: { code?: string | null; message?: string | null } | null): boolean {
  return Boolean(error) && (
    error?.code === DEADLOCK_ERROR_CODE ||
    error?.message?.toLowerCase().includes('deadlock detected') === true
  );
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function runRpcWithDeadlockRetry<T>(operation: () => Promise<{ data: T | null; error: { code?: string | null; message?: string | null } | null }>) {
  for (let attempt = 0; attempt <= DEADLOCK_RETRY_LIMIT; attempt += 1) {
    const result = await operation();
    if (!isDeadlockError(result.error) || attempt === DEADLOCK_RETRY_LIMIT) {
      return result;
    }

    await delay(DEADLOCK_RETRY_DELAY_MS * (attempt + 1));
  }

  return await operation();
}

export async function recalculateRiskForCourses(selectedCourseIds: string[]): Promise<RiskUpdateResult> {
  const runCourseUpdate = async () => {
    if (selectedCourseIds.length === 0) {
      return { failedCount: 0, updatedCount: 0, missingRpc: false };
    }

    const firstCourse = await runRpcWithDeadlockRetry(() => supabase.rpc('update_course_students_risk', {
      p_course_id: selectedCourseIds[0],
    }));

    if (isMissingRpcError(firstCourse.error)) {
      return { failedCount: 0, updatedCount: 0, missingRpc: true };
    }

    if (firstCourse.error) {
      return { failedCount: 1, updatedCount: 0, missingRpc: false };
    }

    if (selectedCourseIds.length === 1) {
      return {
        failedCount: 0,
        updatedCount: firstCourse.data ?? 0,
        missingRpc: false,
      };
    }

    const results = [];
    for (const courseId of selectedCourseIds.slice(1)) {
      results.push(await runRpcWithDeadlockRetry(() => supabase.rpc('update_course_students_risk', {
        p_course_id: courseId,
      })));
    }

    const errors = results
      .map((result) => result.error)
      .filter((error): error is NonNullable<typeof error> => Boolean(error));

    return {
      failedCount: errors.length,
      updatedCount: (firstCourse.data ?? 0) + results.reduce((acc, result) => acc + (result.data ?? 0), 0),
      missingRpc: errors.some(isMissingRpcError),
    };
  };

  const runStudentFallback = async () => {
    if (selectedCourseIds.length === 0) {
      return { failedCount: 0, updatedCount: 0, missingRpc: false };
    }

    const { data: studentCourseRows, error: studentCourseError } = await supabase
      .from('student_courses')
      .select('student_id')
      .in('course_id', selectedCourseIds);

    if (studentCourseError) {
      return { failedCount: 1, updatedCount: 0, missingRpc: false };
    }

    const uniqueStudentIds = Array.from(new Set((studentCourseRows || []).map((row) => row.student_id)));
    if (uniqueStudentIds.length === 0) {
      return { failedCount: 0, updatedCount: 0, missingRpc: false };
    }

    const firstStudent = await runRpcWithDeadlockRetry(() => supabase.rpc('update_student_risk', {
      p_student_id: uniqueStudentIds[0],
    }));

    if (isMissingRpcError(firstStudent.error)) {
      return { failedCount: 0, updatedCount: 0, missingRpc: true };
    }

    if (firstStudent.error) {
      return { failedCount: 1, updatedCount: 0, missingRpc: false };
    }

    if (uniqueStudentIds.length === 1) {
      return { failedCount: 0, updatedCount: 1, missingRpc: false };
    }

    const results = [];
    for (const studentId of uniqueStudentIds.slice(1)) {
      results.push(await runRpcWithDeadlockRetry(() => supabase.rpc('update_student_risk', {
        p_student_id: studentId,
      })));
    }

    const errors = results
      .map((result) => result.error)
      .filter((error): error is NonNullable<typeof error> => Boolean(error));

    return {
      failedCount: errors.length,
      updatedCount: uniqueStudentIds.length - errors.length,
      missingRpc: errors.some(isMissingRpcError),
    };
  };

  let updateResult = await runCourseUpdate();
  let usedFallback = false;

  if (updateResult.missingRpc) {
    usedFallback = true;
    updateResult = await runStudentFallback();
  }

  return {
    ...updateResult,
    usedFallback,
  };
}
