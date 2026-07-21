export const TASKS_CONTRACT_VERSION = 1 as const;

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type TaskStatusDto = typeof TASK_STATUSES[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriorityDto = typeof TASK_PRIORITIES[number];

export interface TaskTagDto {
  color: string | null;
  createdAt: string;
  entityId: string | null;
  entityType: string | null;
  id: string;
  label: string;
  prefix: string | null;
}

export interface TaskDto {
  aiTags: string[];
  assignedTo: string | null;
  createdAt: string;
  createdBy: string | null;
  description: string | null;
  dueDate: string | null;
  entityId: string | null;
  entityType: string | null;
  id: string;
  originReason: string | null;
  priority: TaskPriorityDto;
  projectId: string | null;
  status: TaskStatusDto;
  suggestedByAi: boolean;
  tags: TaskTagDto[];
  title: string;
  updatedAt: string;
}

export interface TaskCommentDto {
  authorId: string | null;
  comment: string;
  createdAt: string;
  id: string;
  taskId: string;
}

export interface TasksMetadataDto {
  contractVersion: typeof TASKS_CONTRACT_VERSION;
  generatedAt: string;
}

export interface TasksPageDto {
  items: TaskDto[];
  metadata: TasksMetadataDto;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface TaskDetailDto {
  comments: TaskCommentDto[];
  metadata: TasksMetadataDto;
  tags: TaskTagDto[];
  task: TaskDto;
}

export interface TaskMutationDto {
  metadata: TasksMetadataDto;
  task: TaskDto;
}

export interface TaskCommentMutationDto {
  comment: TaskCommentDto;
  metadata: TasksMetadataDto;
}
export interface TaskTagMutationDto {
  metadata: TasksMetadataDto;
  tag: TaskTagDto;
}

export interface TaskDeleteDto {
  deleted: boolean;
  metadata: TasksMetadataDto;
}
