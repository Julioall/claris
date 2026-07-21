import type { BulkMessageAudienceDto } from '../contracts/bulk-messaging.contract';
import type { BulkSendAudienceData } from '../../types';

export function mapBulkAudience(dto: BulkMessageAudienceDto): BulkSendAudienceData {
  return {
    gradeLookup: dto.gradeLookup,
    pendingLookup: dto.pendingLookup,
    students: dto.students.map((student) => ({
      avatar_url: student.avatarUrl,
      courses: student.courses.map((course) => ({
        category: course.category ?? undefined,
        course_id: course.courseId,
        course_name: course.courseName,
        enrollment_status: course.enrollmentStatus,
        last_access: course.lastAccess,
        start_date: course.startDate,
      })),
      current_risk_level: student.currentRiskLevel,
      email: student.email,
      enrollment_status: student.enrollmentStatus,
      full_name: student.fullName,
      id: student.id,
      last_access: student.lastAccess,
      moodle_user_id: student.moodleUserId,
    })),
  };
}
