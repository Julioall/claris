// Core types for ACTiM application

export type RiskLevel = 'normal' | 'atencao' | 'risco' | 'critico' | 'inativo';
export type TaskStatus = 'aberta' | 'em_andamento' | 'resolvida';
export type TaskPriority = 'baixa' | 'media' | 'alta' | 'urgente';
export type TaskType = 'moodle' | 'interna';
export type ActionStatus = 'planejada' | 'concluida';
export type ActionType = 'contato' | 'orientacao' | 'cobranca' | 'suporte_tecnico' | 'reuniao' | 'outro';

// Advanced pending tasks system types
export type TaskAutomationType = 'manual' | 'auto_at_risk' | 'auto_missed_assignment' | 'auto_uncorrected_activity' | 'recurring';
export type ActionEffectiveness = 'pendente' | 'eficaz' | 'nao_eficaz' | 'parcialmente_eficaz';
export type RecurrencePattern = 'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'bimestral' | 'trimestral';

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
  last_action_date?: string;
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
  actions?: TaskAction[];
}

export interface Action {
  id: string;
  student_id: string;
  course_id?: string;
  user_id: string;
  action_type: ActionType;
  description: string;
  status: ActionStatus;
  scheduled_date?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  // Relations
  student?: Student;
  course?: Course;
  user?: User;
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

// Task recurrence configuration
export interface TaskRecurrenceConfig {
  id: string;
  title: string;
  description?: string;
  pattern: RecurrencePattern;
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

// Task action (linked to pending task)
export interface TaskAction {
  id: string;
  pending_task_id: string;
  action_type: ActionType;
  description: string;
  effectiveness: ActionEffectiveness;
  executed_by_user_id?: string;
  executed_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Relations
  pending_task?: PendingTask;
  executed_by?: User;
  history?: TaskActionHistory[];
}

// Task action history
export interface TaskActionHistory {
  id: string;
  task_action_id: string;
  pending_task_id: string;
  previous_effectiveness?: ActionEffectiveness;
  new_effectiveness: ActionEffectiveness;
  notes?: string;
  changed_by_user_id?: string;
  created_at: string;
  // Relations
  task_action?: TaskAction;
  changed_by?: User;
}

// UI-specific types
export interface WeeklySummary {
  completed_actions: number;
  pending_actions: number;
  overdue_actions: number;
  pending_tasks: number;
  students_at_risk: number;
  new_at_risk_this_week: number;
  students_without_contact: number;
}

export interface PriorityItem {
  type: 'action' | 'task' | 'student';
  id: string;
  title: string;
  description?: string;
  priority: 'alta' | 'urgente';
  student?: Student;
  due_date?: string;
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
