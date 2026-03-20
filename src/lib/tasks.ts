import {
  PENDING_TASK_PRIORITY_VALUES,
  PENDING_TASK_STATUS_VALUES,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
  type PendingTaskPriority,
  type PendingTaskStatus,
  type TaskPriority,
  type TaskStatus,
} from '@/types';

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  done: 'Concluído',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

export const TASK_STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = TASK_STATUS_VALUES.map((value) => ({
  value,
  label: TASK_STATUS_LABELS[value],
}));

export const TASK_PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = TASK_PRIORITY_VALUES.map((value) => ({
  value,
  label: TASK_PRIORITY_LABELS[value],
}));

const TASK_STATUS_SET = new Set<string>(TASK_STATUS_VALUES);
const TASK_PRIORITY_SET = new Set<string>(TASK_PRIORITY_VALUES);
const PENDING_TASK_STATUS_SET = new Set<string>(PENDING_TASK_STATUS_VALUES);
const PENDING_TASK_PRIORITY_SET = new Set<string>(PENDING_TASK_PRIORITY_VALUES);

const PENDING_TASK_STATUS_MAP: Record<PendingTaskStatus, TaskStatus> = {
  aberta: 'todo',
  em_andamento: 'in_progress',
  resolvida: 'done',
};

const PENDING_TASK_PRIORITY_MAP: Record<PendingTaskPriority, TaskPriority> = {
  baixa: 'low',
  media: 'medium',
  alta: 'high',
  urgente: 'urgent',
};

export function normalizeTaskStatus(status?: string | null): TaskStatus {
  if (status && TASK_STATUS_SET.has(status)) {
    return status as TaskStatus;
  }

  if (status && PENDING_TASK_STATUS_SET.has(status)) {
    return PENDING_TASK_STATUS_MAP[status as PendingTaskStatus];
  }

  return 'todo';
}

export function normalizeTaskPriority(priority?: string | null): TaskPriority {
  if (priority && TASK_PRIORITY_SET.has(priority)) {
    return priority as TaskPriority;
  }

  if (priority && PENDING_TASK_PRIORITY_SET.has(priority)) {
    return PENDING_TASK_PRIORITY_MAP[priority as PendingTaskPriority];
  }

  return 'medium';
}

export const PENDING_TASK_STATUS_TO_TASK_STATUS = PENDING_TASK_STATUS_MAP;
export const PENDING_TASK_PRIORITY_TO_TASK_PRIORITY = PENDING_TASK_PRIORITY_MAP;
