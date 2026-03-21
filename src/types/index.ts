import type { User } from '@/features/auth/types';
import type { Course } from '@/features/courses/types';
import type { Student, RiskLevel } from '@/features/students/types';

export type { AuthContextType, User } from '@/features/auth/types';
export type { Course } from '@/features/courses/types';
export type { CalendarEvent, CalendarEventType, ExternalSource, SyncStatus } from '@/features/agenda/types';
export type {
  PendingTaskPriority,
  PendingTaskStatus,
  RecurrencePattern,
  Tag,
  Task,
  TaskComment,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '@/features/tasks/types';
export type { EnrollmentStatus, RiskLevel, Student } from '@/features/students/types';

export {
  PENDING_TASK_PRIORITY_VALUES,
  PENDING_TASK_STATUS_VALUES,
  RECURRENCE_PATTERN_VALUES,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
  TASK_TYPE_VALUES,
} from '@/features/tasks/types';
export { RISK_LEVEL_VALUES } from '@/features/students/types';

export interface Note {
  id: string;
  student_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  student?: Student;
  user?: User;
}

export interface RiskHistory {
  id: string;
  student_id: string;
  user_id: string;
  previous_level?: RiskLevel;
  new_level: RiskLevel;
  reasons?: string[];
  notes?: string;
  created_at: string;
}

export type { ActivityFeedItem, DashboardReviewActivity, WeeklySummary } from '@/features/dashboard/types';
