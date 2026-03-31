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

export interface StudentRecord {
  id: string;
  moodle_user_id: string | number;
  full_name: string;
  email?: string | null;
  city?: string | null;
  phone?: string | null;
  phone_number?: string | null;
  mobile_phone?: string | null;
  avatar_url?: string | null;
  current_risk_level: RiskLevel;
  risk_reasons?: string[] | null;
  tags?: string[] | null;
  last_access?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface StudentListItem extends StudentRecord {
  enrollment_status: EnrollmentStatus;
}

export interface StudentListPage {
  items: StudentListItem[];
  totalCount: number;
}

export type StudentProfile = StudentRecord;

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
