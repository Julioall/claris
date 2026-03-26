import type { Enums } from '@/integrations/supabase/types';

export interface StudentCourseOption {
  course_id: string;
  course_name: string;
  category?: string;
  last_access?: string | null;
  start_date?: string | null;
  enrollment_status?: string | null;
}

export interface StudentOption {
  id: string;
  full_name: string;
  email?: string | null;
  moodle_user_id: string;
  current_risk_level?: string | null;
  last_access?: string | null;
  enrollment_status?: string;
  courses: StudentCourseOption[];
}

export interface GradeLookupValue {
  gradeFormatted?: string | null;
  gradePercentage?: number | null;
}

export type GradeLookup = Record<string, GradeLookupValue>;
export type PendingLookup = Record<string, number>;

export interface BulkSendAudienceData {
  students: StudentOption[];
  gradeLookup: GradeLookup;
  pendingLookup: PendingLookup;
}

export interface MessageTemplateOption {
  id: string;
  title: string;
  content: string;
  category: string | null;
  is_favorite: boolean | null;
}

export interface MessageTemplate extends MessageTemplateOption {
  created_at: string;
  updated_at: string;
}

export interface BulkMessageJobPreview {
  id: string;
  message_content: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  origin: 'manual' | 'ia';
  status: Enums<'bulk_message_status'>;
  created_at: string;
}

export interface BulkMessageRecipientInput {
  studentId: string;
  moodleUserId: string;
  studentName: string;
  personalizedMessage: string;
}
