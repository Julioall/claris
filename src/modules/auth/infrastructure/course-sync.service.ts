import { supabase } from '@/integrations/supabase/client';
import type { Course } from '@/types';

import { BATCH_DELAY_MS, STEP_BATCH_CONFIG, STEP_FUNCTION_MAP, type CourseScopedSyncEntity } from '../domain/sync';
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
          const { data, error } = await invokeMoodleFunctionWithTimeout({
            functionName,
            body: {
              moodleUrl: params.session.moodleUrl,
              token: params.session.moodleToken,
              courseId: parsedCourseId,
            },
            timeoutMs,
            accessTokenOverride: params.accessToken,
          });

          if (error || data?.error) {
            console.warn(`${params.entity} sync failed for course ${course.moodle_course_id}:`, error || data?.error);
            errorCount += 1;
            return 0;
          }

          if (params.entity === 'students') {
            return (data as { students?: unknown[] })?.students?.length || 0;
          }

          if (params.entity === 'activities') {
            return Number(data?.activitiesCount || 0);
          }

          return Number(data?.gradesCount || 0);
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
