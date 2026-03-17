// Core types for Claris application

export type RiskLevel = 'normal' | 'atencao' | 'risco' | 'critico' | 'inativo';
export type TaskStatus = 'aberta' | 'em_andamento' | 'resolvida';
export type TaskPriority = 'baixa' | 'media' | 'alta' | 'urgente';
export type TaskType = 'moodle' | 'interna';

// Advanced pending tasks system types
export type TaskAutomationType = 'manual' | 'auto_at_risk' | 'auto_missed_assignment' | 'auto_uncorrected_activity' | 'recurring';
export type RecurrencePattern = 'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'bimestral' | 'trimestral';
export type RecurrenceWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

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

export interface PendingTask {
  id: string;
  student_id?: string; // Optional for class-level tasks
  course_id?: string;
  created_by_user_id?: string;
  assigned_to_user_id?: string;
  title: string;
  description?: string;
  task_type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string;
  completed_at?: string;
  moodle_activity_id?: string;
  automation_type?: TaskAutomationType;
  is_recurring?: boolean;
  recurrence_id?: string;
  parent_task_id?: string;
  created_at: string;
  updated_at: string;
  // Relations
  student?: Student;
  course?: Course;
}

export interface Note {
  id: string;
  student_id: string;
  user_id: string;
  pending_task_id?: string;
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

// Task recurrence configuration
export interface TaskRecurrenceConfig {
  id: string;
  title: string;
  description?: string;
  pattern: RecurrencePattern;
  weekly_day?: RecurrenceWeekday | null;
  start_date: string;
  end_date?: string;
  course_id?: string;
  student_id?: string;
  created_by_user_id: string;
  task_type: TaskType;
  priority: TaskPriority;
  is_active: boolean;
  last_generated_at?: string;
  next_generation_at?: string;
  created_at: string;
  updated_at: string;
  // Relations
  course?: Course;
  student?: Student;
  created_by?: User;
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

export interface PriorityItem {
  type: 'task' | 'student';
  id: string;
  title: string;
  description?: string;
  priority: 'alta' | 'urgente';
  student?: Student;
  due_date?: string;
}

// ── Tarefas (Internal Tasks) module ────────────────────────────────────────

export type InternalTaskStatus = 'backlog' | 'em_andamento' | 'concluida' | 'cancelada';
export type InternalTaskPriority = 'baixa' | 'media' | 'alta' | 'urgente';

export interface InternalTaskComment {
  id: string;
  task_id: string;
  user_id?: string;
  content: string;
  created_at: string;
  user?: Pick<User, 'id' | 'full_name'>;
}

export interface InternalTask {
  id: string;
  title: string;
  description?: string;
  status: InternalTaskStatus;
  priority: InternalTaskPriority;
  category?: string;
  created_by_user_id?: string;
  assigned_to_user_id?: string;
  due_date?: string;
  completed_at?: string;
  /** Future: link to internal projects */
  project_id?: string;
  /** Future: Microsoft Teams task identifier */
  teams_task_id?: string;
  created_at: string;
  updated_at?: string;
  // Relations
  created_by?: Pick<User, 'id' | 'full_name'>;
  assigned_to?: Pick<User, 'id' | 'full_name'>;
  comments?: InternalTaskComment[];
}

// ── Agenda module ───────────────────────────────────────────────────────────

export type AgendaEventType = 'reuniao' | 'webaula' | 'rotina' | 'compromisso' | 'outro';
export type AgendaEventStatus = 'agendado' | 'em_andamento' | 'concluido' | 'cancelado';

export interface AgendaParticipant {
  user_id?: string;
  name: string;
  email?: string;
}

export interface AgendaEvent {
  id: string;
  title: string;
  description?: string;
  event_type: AgendaEventType;
  start_at: string;
  end_at?: string;
  all_day: boolean;
  location?: string;
  meeting_url?: string;
  is_recurring: boolean;
  recurrence_rule?: string;
  recurrence_parent_id?: string;
  participants: AgendaParticipant[];
  created_by_user_id?: string;
  /** Future: Microsoft Teams event identifier */
  teams_event_id?: string;
  /** Future: Microsoft Teams online meeting URL */
  teams_online_meeting_url?: string;
  /** Future: Microsoft Teams join URL */
  teams_join_url?: string;
  /** Future: timestamp of last sync from Teams */
  synced_from_teams_at?: string;
  status: AgendaEventStatus;
  created_at: string;
  updated_at?: string;
  // Relations
  created_by?: Pick<User, 'id' | 'full_name'>;
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
