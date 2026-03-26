export const TASK_STATUS_VALUES = ['todo', 'in_progress', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

export const TASK_PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITY_VALUES)[number];

export const PENDING_TASK_STATUS_VALUES = ['aberta', 'em_andamento', 'resolvida'] as const;
export type PendingTaskStatus = (typeof PENDING_TASK_STATUS_VALUES)[number];

export const PENDING_TASK_PRIORITY_VALUES = ['baixa', 'media', 'alta', 'urgente'] as const;
export type PendingTaskPriority = (typeof PENDING_TASK_PRIORITY_VALUES)[number];

export const TASK_TYPE_VALUES = ['moodle', 'interna'] as const;
export type TaskType = (typeof TASK_TYPE_VALUES)[number];

export const RECURRENCE_PATTERN_VALUES = ['diario', 'semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral'] as const;
export type RecurrencePattern = (typeof RECURRENCE_PATTERN_VALUES)[number];

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
