import type { Course } from '@/features/courses/types';

import type { MoodleSyncCourseDto } from '../contracts/moodle-sync-jobs.contract';

export function mapMoodleSyncCourse(course: MoodleSyncCourseDto): Course {
  return {
    id: course.id,
    moodle_course_id: course.moodleCourseId,
    name: course.name,
    ...(course.shortName ? { short_name: course.shortName } : {}),
    ...(course.category ? { category: course.category } : {}),
    ...(course.startsAt ? { start_date: course.startsAt } : {}),
    ...(course.endsAt ? { end_date: course.endsAt } : {}),
    ...(course.lastSynchronizedAt ? { last_sync: course.lastSynchronizedAt } : {}),
    ...(course.createdAt ? { created_at: course.createdAt } : {}),
    ...(course.updatedAt ? { updated_at: course.updatedAt } : {}),
  };
}
