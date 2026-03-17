// Core types for Claris application

export type RiskLevel = 'normal' | 'atencao' | 'risco' | 'critico' | 'inativo';

export interface User {
  id: string;
  moodle_user_id: string;
  moodle_username: string;
  full_name: string;
  email?: string;
  avatar_url?: string;
  last_login?: string;
  last_sync?: string;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  moodle_course_id: string;
  name: string;
  short_name?: string;
  category?: string;
  start_date?: string;
  end_date?: string;
  effective_end_date?: string;
  last_sync?: string;
  created_at: string;
  updated_at: string;
  // Computed fields for UI
  students_count?: number;
  at_risk_count?: number;
  pending_tasks_count?: number;
}

export interface Student {
  id: string;
  moodle_user_id: string;
  full_name: string;
  email?: string;
  avatar_url?: string;
  current_risk_level: RiskLevel;
  risk_reasons?: string[];
  tags?: string[];
  last_access?: string;
  created_at: string;
  updated_at: string;
  // Computed fields for UI
  courses?: Course[];
  pending_tasks_count?: number;
}

export interface Note {
  id: string;
  student_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  // Relations
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
  // Relations
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

// UI-specific types
export interface WeeklySummary {
  pending_tasks: number;
  overdue_tasks: number;
  activities_to_review: number;
  active_normal_students: number;
  pending_submission_assignments: number;
  pending_correction_assignments: number;
  students_at_risk: number;
  new_at_risk_this_week: number;
}

// ── Tasks module ─────────────────────────────────────────────
// These types support BOTH the existing `pending_tasks` DB table (Portuguese enums)
// and the planned `tasks` table (English enums). Components should handle both.
export type TaskStatus = 'aberta' | 'em_andamento' | 'resolvida' | 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'baixa' | 'media' | 'alta' | 'urgente' | 'low' | 'medium' | 'high' | 'urgent';

export interface Tag {
  id: string;
  label: string;
  prefix?: string | null;
  entity_id?: string | null;
  entity_type?: string | null;
  color?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to?: string | null;
  created_by?: string | null;
  due_date?: string | null;
  project_id?: string | null;
  suggested_by_ai?: boolean | null;
  origin_reason?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  ai_tags?: string[];
  created_at: string;
  updated_at: string;
  tags?: Tag[];
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id?: string | null;
  comment: string;
  created_at: string;
}

export interface TaskHistoryEntry {
  id: string;
  task_id: string;
  field_changed: string;
  old_value?: string | null;
  new_value?: string | null;
  changed_by?: string | null;
  created_at: string;
}

// ── Agenda module ─────────────────────────────────────────────
export type CalendarEventType = 'manual' | 'webclass' | 'meeting' | 'alignment' | 'delivery' | 'other';
export type ExternalSource = 'manual' | 'teams' | 'future_sync';
export type SyncStatus = 'none' | 'synced' | 'pending' | 'error';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  type: CalendarEventType;
  owner?: string | null;
  external_source: ExternalSource;
  external_id?: string | null;
  external_provider?: string | null;
  external_event_id?: string | null;
  sync_status?: SyncStatus | null;
  last_sync_at?: string | null;
  created_at: string;
  updated_at: string;
}

// Auth context type
export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isSyncing: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string, moodleUrl: string, service?: string) => Promise<boolean>;
  logout: () => void;
  syncData: () => Promise<void>;
  lastSync: string | null;
}
