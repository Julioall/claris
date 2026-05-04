import { getStudentActivityWorkflowStatus } from '@/lib/student-activity-status';
import type { Student } from '@/features/students/types';
import type { CoursePanelStats, StudentActivity } from '../types';

export interface CoursePanelEnrollmentRow {
  enrollment_status: string | null;
  student_id: string;
}

interface BuildCoursePanelStatsInput {
  activities: StudentActivity[];
  activityRecords: StudentActivity[];
  enrollmentRows: CoursePanelEnrollmentRow[];
  isCourseInProgress: boolean;
  students: Student[];
}

const INACTIVE_ENROLLMENT_STATUSES = new Set([
  'suspenso',
  'suspended',
  'inativo',
  'inactive',
  'nao atualmente',
  'not current',
  'not_current',
  'notcurrently',
]);

const ACTIVE_ENROLLMENT_STATUSES = new Set(['', 'ativo', 'active']);

function normalizeText(value: string | null | undefined) {
  return (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isEnrollmentCountedAsEnrolled(status: string | null | undefined) {
  return !INACTIVE_ENROLLMENT_STATUSES.has(normalizeText(status));
}

function isEnrollmentEligibleForRisk(status: string | null | undefined) {
  return ACTIVE_ENROLLMENT_STATUSES.has(normalizeText(status));
}

function isActivityCompletedForRate(activity: StudentActivity) {
  return getStudentActivityWorkflowStatus(activity) !== 'pending_submission';
}

export function buildCoursePanelStats({
  activities,
  activityRecords,
  enrollmentRows,
  isCourseInProgress,
  students,
}: BuildCoursePanelStatsInput): CoursePanelStats {
  const enrolledStudentIds = new Set(
    enrollmentRows
      .filter((entry) => isEnrollmentCountedAsEnrolled(entry.enrollment_status))
      .map((entry) => entry.student_id),
  );

  const riskEligibleStudentIds = new Set(
    enrollmentRows
      .filter((entry) => isEnrollmentEligibleForRisk(entry.enrollment_status))
      .map((entry) => entry.student_id),
  );

  const riskDistribution: CoursePanelStats['riskDistribution'] = {
    normal: 0,
    atencao: 0,
    risco: 0,
    critico: 0,
  };

  if (isCourseInProgress) {
    students.forEach((student) => {
      if (!riskEligibleStudentIds.has(student.id)) return;

      const level = student.current_risk_level || 'normal';
      if (level in riskDistribution) {
        riskDistribution[level as keyof typeof riskDistribution] += 1;
      }
    });
  }

  const visibleActivityIds = new Set(
    activities
      .filter((activity) => !activity.hidden)
      .map((activity) => activity.moodle_activity_id),
  );

  const visibleActivityRecords = activityRecords.filter((activity) =>
    enrolledStudentIds.has(activity.student_id) &&
    visibleActivityIds.has(activity.moodle_activity_id),
  );

  const visibleSyncedActivityCount = new Set(
    visibleActivityRecords.map((activity) => activity.moodle_activity_id),
  ).size;

  const completedActivityRecords = visibleActivityRecords.filter(isActivityCompletedForRate).length;

  return {
    totalStudents: enrolledStudentIds.size,
    atRiskStudents: riskDistribution.risco + riskDistribution.critico,
    totalActivities: visibleSyncedActivityCount,
    completionRate: visibleActivityRecords.length > 0
      ? Math.round((completedActivityRecords / visibleActivityRecords.length) * 100)
      : 0,
    riskDistribution,
  };
}
