import type { User } from '@/features/auth/types';
import type { Course } from '@/features/courses/types';
import type { RiskLevel, Student } from '@/features/students/types';

export interface ActivityFeedItem {
  id: string;
  user_id?: string;
  student_id?: string;
  course_id?: string;
  event_type: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  student?: Student;
  course?: Course;
  user?: User;
}

export interface DashboardReviewActivity {
  id: string;
  activity_name: string;
  student_id: string;
  course_id: string;
  due_date?: string;
  submitted_at?: string;
  student: Pick<Student, 'id' | 'full_name' | 'current_risk_level'>;
  course: Pick<Course, 'id' | 'name' | 'short_name'>;
}

export interface WeeklySummary {
  today_events: number;
  today_tasks: number;
  activities_to_review: number;
  active_normal_students: number;
  pending_submission_assignments: number;
  pending_correction_assignments: number;
  students_at_risk: number;
  new_at_risk_this_week: number;
}

export type DashboardRiskLevel = RiskLevel;
