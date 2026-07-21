import type {
  StudentHistoryDto,
  StudentProfileCourseDto,
  StudentProfileDto,
  StudentsPageDto,
} from '../contracts/students.contract';
import type {
  StudentHistory,
  StudentListPage,
  StudentProfile,
  StudentProfileCourse,
} from '../../types';

function mapProfileCourse(course: StudentProfileCourseDto): StudentProfileCourse {
  return {
    activities: course.activities.map((activity) => ({
      dueAt: activity.dueAt,
      grade: activity.grade,
      gradeMaximum: activity.gradeMaximum,
      hidden: activity.hidden,
      id: activity.id,
      moodleActivityId: activity.moodleActivityId,
      name: activity.name,
      percentage: activity.percentage,
      type: activity.type,
      workflowStatus: activity.workflowStatus,
    })),
    grade: course.grade ? { ...course.grade } : null,
    id: course.id,
    name: course.name,
    shortName: course.shortName,
  };
}

export function mapStudentsPage(page: StudentsPageDto): StudentListPage {
  return {
    items: page.items.map((student) => ({ ...student })),
    metadata: { ...page.metadata },
    page: page.page,
    pageSize: page.pageSize,
    totalCount: page.totalCount,
    totalPages: page.totalPages,
  };
}

export function mapStudentProfile(profile: StudentProfileDto): StudentProfile {
  return {
    courses: profile.courses.map(mapProfileCourse),
    metadata: { ...profile.metadata },
    student: {
      ...profile.student,
      riskReasons: [...profile.student.riskReasons],
      tags: [...profile.student.tags],
    },
  };
}

export function mapStudentHistory(history: StudentHistoryDto): StudentHistory {
  return {
    items: history.items.map((snapshot) => ({
      ...snapshot,
      course: snapshot.course ? { ...snapshot.course } : null,
    })),
    metadata: { ...history.metadata },
  };
}
