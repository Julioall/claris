export const COURSE_PANEL_CONTRACT_VERSION = 1 as const;

export const COURSE_PANEL_RISK_LEVELS = [
  'normal',
  'atencao',
  'risco',
  'critico',
  'inativo',
] as const;

export const COURSE_PANEL_LIFECYCLES = [
  'notStarted',
  'inProgress',
  'finished',
] as const;

export const COURSE_PANEL_WORKFLOW_STATUSES = [
  'pendingSubmission',
  'pendingCorrection',
  'completed',
  'corrected',
] as const;

export type CoursePanelRiskLevelDto = (typeof COURSE_PANEL_RISK_LEVELS)[number];
export type CoursePanelLifecycleDto = (typeof COURSE_PANEL_LIFECYCLES)[number];
export type CoursePanelWorkflowStatusDto = (typeof COURSE_PANEL_WORKFLOW_STATUSES)[number];

export interface CoursePanelCourseDto {
  category: string | null;
  effectiveEndsAt: string | null;
  endsAt: string | null;
  id: string;
  lastSyncedAt: string | null;
  lifecycle: CoursePanelLifecycleDto;
  moodleCourseId: string;
  name: string;
  shortName: string | null;
  startsAt: string | null;
}

export interface CoursePanelStudentDto {
  avatarUrl: string | null;
  email: string | null;
  enrollmentStatus: string | null;
  id: string;
  lastAccessAt: string | null;
  name: string;
  riskLevel: CoursePanelRiskLevelDto;
}

export interface CoursePanelSubmissionDto {
  completedAt: string | null;
  grade: number | null;
  gradedAt: string | null;
  gradeMax: number | null;
  id: string;
  percentage: number | null;
  studentId: string;
  submittedAt: string | null;
  workflowStatus: CoursePanelWorkflowStatusDto;
}

export interface CoursePanelSubmissionCountsDto {
  completed: number;
  corrected: number;
  pendingCorrection: number;
  pendingSubmission: number;
  total: number;
}

export interface CoursePanelActivityDto {
  courseId: string;
  dueAt: string | null;
  hidden: boolean;
  id: string;
  isAssignment: boolean;
  moodleActivityId: string;
  name: string;
  submissionCounts: CoursePanelSubmissionCountsDto;
  submissions: CoursePanelSubmissionDto[];
  type: string | null;
}

export interface CoursePanelStatsDto {
  atRiskStudents: number;
  completionRate: number;
  riskDistribution: {
    atencao: number;
    critico: number;
    normal: number;
    risco: number;
  };
  totalActivities: number;
  totalStudents: number;
}

export interface CoursePanelDto {
  activities: CoursePanelActivityDto[];
  attendanceEnabled: boolean;
  course: CoursePanelCourseDto;
  metadata: {
    contractVersion: typeof COURSE_PANEL_CONTRACT_VERSION;
    dataUpdatedAt: string | null;
    generatedAt: string;
  };
  stats: CoursePanelStatsDto;
  students: CoursePanelStudentDto[];
}

export interface SetCourseActivityVisibilityDto {
  courseId: string;
  hidden: boolean;
  metadata: {
    contractVersion: typeof COURSE_PANEL_CONTRACT_VERSION;
    generatedAt: string;
  };
  moodleActivityId: string;
  updatedCount: number;
}
