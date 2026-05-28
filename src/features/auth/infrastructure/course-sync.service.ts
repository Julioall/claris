import { supabase } from '@/integrations/supabase/client';
import type { Course } from '@/features/courses/types';

import {
  BATCH_DELAY_MS,
  STEP_BATCH_CONFIG,
  STEP_FUNCTION_MAP,
  STUDENT_BATCH_CONFIG,
  type CourseScopedSyncEntity,
} from '../domain/sync';
import type { MoodleSession } from '../domain/session';
import { invokeMoodleFunctionWithTimeout } from './moodle-api';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function resolveCoursesByIds(courseIds: string[], cachedCourses: Course[]): Promise<Course[]> {
  const uniqueIds = Array.from(new Set(courseIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const existingById = new Map(cachedCourses.map((course) => [course.id, course]));
  const resolved: Course[] = [];
  const missingIds: string[] = [];

  for (const courseId of uniqueIds) {
    const cachedCourse = existingById.get(courseId);
    if (cachedCourse) {
      resolved.push(cachedCourse);
      continue;
    }
    missingIds.push(courseId);
  }

  if (missingIds.length === 0) return resolved;

  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .in('id', missingIds);

  if (error) {
    console.error('Error loading courses for scoped sync:', error);
    return resolved;
  }

  return resolved.concat((data ?? []) as Course[]);
}

export async function runBatchedEntitySync(params: {
  entity: CourseScopedSyncEntity;
  selectedCourses: Course[];
  session: MoodleSession;
  accessToken?: string;
  onProgress?: (processedCourses: number) => void;
}): Promise<{ totalCount: number; succeeded: boolean; errorCount: number }> {
  const { batchSize, timeoutMs } = STEP_BATCH_CONFIG[params.entity];
  const functionName = STEP_FUNCTION_MAP[params.entity];
  let totalCount = 0;
  let errorCount = 0;
  let processedCourses = 0;

  for (let index = 0; index < params.selectedCourses.length; index += batchSize) {
    const batch = params.selectedCourses.slice(index, index + batchSize);

    const results = await Promise.allSettled(
      batch.map(async (course) => {
        const parsedCourseId = Number.parseInt(course.moodle_course_id, 10);
        if (!Number.isFinite(parsedCourseId)) return 0;

        try {
          const result = await runCourseEntitySync({
            accessToken: params.accessToken,
            courseId: parsedCourseId,
            entity: params.entity,
            functionName,
            session: params.session,
            timeoutMs,
          });

          if (!result.succeeded) {
            console.warn(`${params.entity} sync failed for course ${course.moodle_course_id}:`, result.errorMessage);
            errorCount += 1;
            return 0;
          }

          return result.totalCount;
        } catch (error) {
          console.warn(`${params.entity} sync error for course ${course.moodle_course_id}:`, error);
          errorCount += 1;
          return 0;
        }
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        totalCount += result.value;
      } else {
        errorCount += 1;
      }
    }

    processedCourses += batch.length;
    params.onProgress?.(processedCourses);

    if (index + batchSize < params.selectedCourses.length) {
      await wait(BATCH_DELAY_MS);
    }
  }

  const failedCompletely = errorCount > 0 && totalCount === 0;
  return {
    totalCount,
    succeeded: !failedCompletely,
    errorCount,
  };
}

async function runCourseEntitySync(params: {
  accessToken?: string;
  courseId: number;
  entity: CourseScopedSyncEntity;
  functionName: string;
  session: MoodleSession;
  timeoutMs: number;
}): Promise<{ totalCount: number; succeeded: boolean; errorMessage?: string }> {
  const studentBatchConfig = STUDENT_BATCH_CONFIG[params.entity];
  let totalCount = 0;
  let studentBatchPage = 1;
  let guard = 0;

  while (guard < 200) {
    guard += 1;

    const body: Record<string, unknown> = {
      moodleUrl: params.session.moodleUrl,
      token: params.session.moodleToken,
      courseId: params.courseId,
    };

    if (studentBatchConfig) {
      body.studentBatchPage = studentBatchPage;
      body.studentBatchSize = studentBatchConfig.batchSize;
    }

    const { data, error } = await invokeMoodleFunctionWithTimeout({
      functionName: params.functionName,
      body,
      timeoutMs: params.timeoutMs,
      accessTokenOverride: params.accessToken,
    });

    if (error || data?.error) {
      return {
        totalCount,
        succeeded: false,
        errorMessage:
          error?.message ||
          (typeof data?.error === 'string' ? data.error : undefined) ||
          'Falha ao sincronizar curso',
      };
    }

    totalCount += readEntityCount(params.entity, data);

    if (!studentBatchConfig || !data?.hasMore) {
      return { totalCount, succeeded: true };
    }

    const nextPage = Number(data.nextStudentBatchPage);
    studentBatchPage = Number.isFinite(nextPage) && nextPage > studentBatchPage
      ? nextPage
      : studentBatchPage + 1;

    await wait(studentBatchConfig.delayMs);
  }

  return {
    totalCount,
    succeeded: false,
    errorMessage: 'Limite de lotes excedido durante a sincronizacao do curso',
  };
}

function readEntityCount(entity: CourseScopedSyncEntity, data: Record<string, unknown> | null): number {
  if (entity === 'students') {
    return (data as { students?: unknown[] } | null)?.students?.length || 0;
  }

  if (entity === 'activities') {
    return Number(data?.activitiesCount || 0);
  }

  return Number(data?.gradesCount || 0);
}
