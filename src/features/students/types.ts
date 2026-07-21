import type { Course } from '@/features/courses/types';

export const RISK_LEVEL_VALUES = ['normal', 'atencao', 'risco', 'critico', 'inativo'] as const;
export type RiskLevel = (typeof RISK_LEVEL_VALUES)[number];

export type EnrollmentStatus = 'ativo' | 'suspenso' | 'concluido' | 'inativo';

export interface Student {
  id: string;
  moodle_user_id: string;
  full_name: string;
  email?: string;
  city?: string;
  phone?: string;
  phone_number?: string;
  mobile_phone?: string;
  avatar_url?: string;
  current_risk_level: RiskLevel;
  risk_reasons?: string[];
  tags?: string[];
  last_access?: string;
  created_at: string;
  updated_at: string;
  courses?: Course[];
}

export interface StudentListItem {
  avatarUrl: string | null;
  email: string | null;
  enrollmentStatus: EnrollmentStatus;
  id: string;
  lastAccessAt: string | null;
  name: string;
  riskLevel: RiskLevel;
}

export interface StudentListPage {
  items: StudentListItem[];
  metadata: {
    contractVersion: 1;
    generatedAt: string;
  };
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export type StudentActivityWorkflowStatus =
  | 'pendingSubmission'
  | 'pendingCorrection'
  | 'completed'
  | 'corrected';

export interface StudentCourseGrade {
  formatted: string | null;
  letter: string | null;
  maximum: number | null;
  percentage: number | null;
  raw: number | null;
  synchronizedAt: string | null;
}

export interface StudentCourseActivity {
  dueAt: string | null;
  grade: number | null;
  gradeMaximum: number | null;
  hidden: boolean;
  id: string;
  moodleActivityId: string;
  name: string;
  percentage: number | null;
  type: string | null;
  workflowStatus: StudentActivityWorkflowStatus;
}

export interface StudentProfileCourse {
  activities: StudentCourseActivity[];
  grade: StudentCourseGrade | null;
  id: string;
  name: string;
  shortName: string | null;
}

export interface StudentProfileIdentity {
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
  riskLevel: RiskLevel;
  riskReasons: string[];
  tags: string[];
  updatedAt: string | null;
}

export interface StudentProfile {
  courses: StudentProfileCourse[];
  metadata: {
    contractVersion: 1;
    dataUpdatedAt: string | null;
    generatedAt: string;
  };
  student: StudentProfileIdentity;
}

export interface StudentHistoryCourse {
  endsAt: string | null;
  id: string;
  name: string;
  shortName: string | null;
  startsAt: string | null;
}

export interface StudentHistorySnapshot {
  course: StudentHistoryCourse | null;
  courseId: string;
  createdAt: string;
  daysSinceAccess: number | null;
  enrollmentStatus: string;
  id: string;
  lastAccessAt: string | null;
  overdueActivities: number;
  pendingActivities: number;
  riskLevel: RiskLevel;
  synchronizedAt: string;
}

export interface StudentHistory {
  items: StudentHistorySnapshot[];
  metadata: {
    contractVersion: 1;
    dataUpdatedAt: string | null;
    generatedAt: string;
  };
}

export type GradeSuggestionStatus = 'success' | 'invalid' | 'manual_review_required' | 'error';
export type GradeSuggestionConfidence = 'high' | 'medium' | 'low';

export interface GradeSuggestionSource {
  label: string;
  type: string;
  extractionQuality?: 'high' | 'medium' | 'low' | 'none';
  requiresVisualAnalysis?: boolean;
}

export interface StudentGradeSuggestionResult {
  status: GradeSuggestionStatus;
  suggestedGrade: number | null;
  suggestedFeedback: string | null;
  confidence: GradeSuggestionConfidence;
  sourcesUsed: GradeSuggestionSource[];
  warnings: string[];
  evaluationStatus: string;
  reason?: string;
}

export interface StudentGradeSuggestionResponse {
  success: boolean;
  auditId?: string;
  message?: string;
  result?: StudentGradeSuggestionResult;
}

export interface ActivityStudentGradeSuggestionItem {
  studentId: string;
  studentActivityId: string;
  auditId?: string;
  result: StudentGradeSuggestionResult;
}

export type ActivityGradeSuggestionJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type ActivityGradeSuggestionJobItemStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface ActivityGradeSuggestionJobItem {
  id: string;
  studentId: string;
  studentActivityId: string;
  studentName: string;
  status: ActivityGradeSuggestionJobItemStatus;
  auditId?: string;
  errorMessage?: string;
  result?: StudentGradeSuggestionResult;
}

export interface ActivityGradeSuggestionResponse {
  success: boolean;
  jobId: string | null;
  status: ActivityGradeSuggestionJobStatus;
  message?: string;
  totalItems: number;
  processedItems: number;
  successCount: number;
  errorCount: number;
  items: ActivityGradeSuggestionJobItem[];
}

export interface ActivityGradeSuggestionJobSummary {
  jobId: string;
  activityName: string;
  courseId: string;
  moodleActivityId: string;
  status: ActivityGradeSuggestionJobStatus;
  totalItems: number;
  processedItems: number;
  successCount: number;
  errorCount: number;
  errorMessage?: string | null;
  createdAt: string;
}

export interface StudentGradeApprovalResponse {
  success: boolean;
  message?: string;
  approvedGrade?: number;
  approvedFeedback?: string;
}
