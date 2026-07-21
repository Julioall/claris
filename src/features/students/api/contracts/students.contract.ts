export const STUDENTS_CONTRACT_VERSION = 1 as const;

export const STUDENT_RISK_LEVELS = [
  'normal',
  'atencao',
  'risco',
  'critico',
  'inativo',
] as const;

export const STUDENT_ENROLLMENT_STATUSES = [
  'ativo',
  'suspenso',
  'concluido',
  'inativo',
] as const;

export const STUDENT_ACTIVITY_WORKFLOW_STATUSES = [
  'pendingSubmission',
  'pendingCorrection',
  'completed',
  'corrected',
] as const;

export type StudentRiskLevelDto = typeof STUDENT_RISK_LEVELS[number];
export type StudentEnrollmentStatusDto = typeof STUDENT_ENROLLMENT_STATUSES[number];
export type StudentActivityWorkflowStatusDto = typeof STUDENT_ACTIVITY_WORKFLOW_STATUSES[number];

export interface StudentListItemDto {
  avatarUrl: string | null;
  email: string | null;
  enrollmentStatus: StudentEnrollmentStatusDto;
  id: string;
  lastAccessAt: string | null;
  name: string;
  riskLevel: StudentRiskLevelDto;
}

export interface StudentsPageDto {
  items: StudentListItemDto[];
  metadata: {
    contractVersion: typeof STUDENTS_CONTRACT_VERSION;
    generatedAt: string;
  };
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface StudentProfileIdentityDto {
  avatarUrl: string | null;
  city: string | null;
  createdAt: string | null;
  email: string | null;
  id: string;
  lastAccessAt: string | null;
  mobilePhone: string | null;
  moodleUserId: string;
  name: string;
  phone: string | null;
  phoneNumber: string | null;
  riskLevel: StudentRiskLevelDto;
  riskReasons: string[];
  tags: string[];
  updatedAt: string | null;
}

export interface StudentCourseGradeDto {
  formatted: string | null;
  letter: string | null;
  maximum: number | null;
  percentage: number | null;
  raw: number | null;
  synchronizedAt: string | null;
}

export interface StudentCourseActivityDto {
  dueAt: string | null;
  grade: number | null;
  gradeMaximum: number | null;
  hidden: boolean;
  id: string;
  moodleActivityId: string;
  name: string;
  percentage: number | null;
  type: string | null;
  workflowStatus: StudentActivityWorkflowStatusDto;
}

export interface StudentProfileCourseDto {
  activities: StudentCourseActivityDto[];
  grade: StudentCourseGradeDto | null;
  id: string;
  name: string;
  shortName: string | null;
}

export interface StudentProfileDto {
  courses: StudentProfileCourseDto[];
  metadata: {
    contractVersion: typeof STUDENTS_CONTRACT_VERSION;
    dataUpdatedAt: string | null;
    generatedAt: string;
  };
  student: StudentProfileIdentityDto;
}

export interface StudentHistoryCourseDto {
  endsAt: string | null;
  id: string;
  name: string;
  shortName: string | null;
  startsAt: string | null;
}

export interface StudentHistorySnapshotDto {
  course: StudentHistoryCourseDto | null;
  courseId: string;
  createdAt: string;
  daysSinceAccess: number | null;
  enrollmentStatus: string;
  id: string;
  lastAccessAt: string | null;
  overdueActivities: number;
  pendingActivities: number;
  riskLevel: StudentRiskLevelDto;
  synchronizedAt: string;
}

export interface StudentHistoryDto {
  items: StudentHistorySnapshotDto[];
  metadata: {
    contractVersion: typeof STUDENTS_CONTRACT_VERSION;
    dataUpdatedAt: string | null;
    generatedAt: string;
  };
}
