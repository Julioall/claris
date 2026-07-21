import type { CourseWithStats } from '../../types';
import type { CourseCatalogItemDto } from '../contracts/course-catalog.contract';

export function mapCourseCatalogItem(item: CourseCatalogItemDto): CourseWithStats {
  return {
    id: item.id,
    moodle_course_id: item.moodleCourseId,
    name: item.name,
    short_name: item.shortName ?? undefined,
    category: item.category ?? undefined,
    start_date: item.startsAt ?? undefined,
    end_date: item.endsAt ?? undefined,
    effective_end_date: item.effectiveEndsAt ?? undefined,
    last_sync: item.lastSynchronizedAt ?? undefined,
    created_at: item.createdAt ?? undefined,
    updated_at: item.updatedAt ?? undefined,
    students_count: item.studentCount,
    at_risk_count: item.atRiskStudentCount,
    is_following: item.isFollowing,
    is_ignored: item.isIgnored,
    is_attendance_enabled: item.isAttendanceEnabled,
    student_ids: item.studentIds,
  };
}
