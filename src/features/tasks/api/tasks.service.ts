import { ApiClientError, invokeEdgeFunction } from '@/integrations/http/edge-function-client';

import type { Tag, Task, TaskComment, TaskPriority, TaskStatus } from '../types';
import {
  TASKS_CONTRACT_VERSION,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskCommentDto,
  type TaskCommentMutationDto,
  type TaskDeleteDto,
  type TaskDetailDto,
  type TaskDto,
  type TaskMutationDto,
  type TaskTagDto,
  type TaskTagMutationDto,
  type TasksMetadataDto,
  type TasksPageDto,
} from './contracts/tasks.contract';
import { mapTask, mapTaskComment, mapTaskTag } from './mappers/task.mapper';

export interface CreateTaskInput {
  assigned_to?: string;
  description?: string;
  due_date?: string;
  priority?: TaskPriority;
  project_id?: string;
  status?: TaskStatus;
  title: string;
}

export interface UpdateTaskInput {
  assigned_to?: string | null;
  description?: string | null;
  due_date?: string | null;
  priority?: TaskPriority;
  project_id?: string | null;
  status?: TaskStatus;
  title?: string;
}

export interface AddTaskTagInput {
  entityId?: string;
  entityType?: string;
  label: string;
  prefix?: string;
}

export interface TaskDetail {
  comments: TaskComment[];
  tags: Tag[];
  task: Task;
}

const TASKS_TIMEOUT_MS = 15_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function invalidResponse(expected: string): never {
  throw new ApiClientError({
    code: 'invalid_response',
    message: `A API de tarefas retornou ${expected} em formato invalido.`,
  });
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isMetadata(value: unknown): value is TasksMetadataDto {
  const metadata = asRecord(value);
  return Boolean(
    metadata
    && metadata.contractVersion === TASKS_CONTRACT_VERSION
    && typeof metadata.generatedAt === 'string',
  );
}

function isTag(value: unknown): value is TaskTagDto {
  const tag = asRecord(value);
  return Boolean(
    tag
    && typeof tag.id === 'string'
    && typeof tag.label === 'string'
    && typeof tag.createdAt === 'string'
    && isNullableString(tag.prefix)
    && isNullableString(tag.entityId)
    && isNullableString(tag.entityType)
    && isNullableString(tag.color),
  );
}

function isTask(value: unknown): value is TaskDto {
  const task = asRecord(value);
  return Boolean(
    task
    && typeof task.id === 'string'
    && typeof task.title === 'string'
    && isNullableString(task.description)
    && TASK_STATUSES.includes(task.status as TaskStatus)
    && TASK_PRIORITIES.includes(task.priority as TaskPriority)
    && isNullableString(task.assignedTo)
    && isNullableString(task.createdBy)
    && isNullableString(task.dueDate)
    && isNullableString(task.projectId)
    && typeof task.suggestedByAi === 'boolean'
    && isNullableString(task.originReason)
    && isNullableString(task.entityType)
    && isNullableString(task.entityId)
    && Array.isArray(task.aiTags)
    && task.aiTags.every((tag) => typeof tag === 'string')
    && Array.isArray(task.tags)
    && task.tags.every(isTag)
    && typeof task.createdAt === 'string'
    && typeof task.updatedAt === 'string',
  );
}

function isComment(value: unknown): value is TaskCommentDto {
  const comment = asRecord(value);
  return Boolean(
    comment
    && typeof comment.id === 'string'
    && typeof comment.taskId === 'string'
    && isNullableString(comment.authorId)
    && typeof comment.comment === 'string'
    && typeof comment.createdAt === 'string',
  );
}

function parseTasksPage(value: unknown): TasksPageDto {
  const page = asRecord(value);
  if (!(
    page
    && Array.isArray(page.items)
    && page.items.every(isTask)
    && Number.isSafeInteger(page.page)
    && Number.isSafeInteger(page.pageSize)
    && Number.isSafeInteger(page.totalCount)
    && Number.isSafeInteger(page.totalPages)
    && isMetadata(page.metadata)
  )) invalidResponse('uma pagina');
  return page as unknown as TasksPageDto;
}

function parseTaskDetail(value: unknown): TaskDetailDto {
  const detail = asRecord(value);
  if (!(
    detail
    && isTask(detail.task)
    && Array.isArray(detail.comments)
    && detail.comments.every(isComment)
    && Array.isArray(detail.tags)
    && detail.tags.every(isTag)
    && isMetadata(detail.metadata)
  )) invalidResponse('um detalhe');
  return detail as unknown as TaskDetailDto;
}

function parseTaskMutation(value: unknown): TaskMutationDto {
  const mutation = asRecord(value);
  if (!(mutation && isTask(mutation.task) && isMetadata(mutation.metadata))) {
    invalidResponse('uma tarefa');
  }
  return mutation as unknown as TaskMutationDto;
}

function parseCommentMutation(value: unknown): TaskCommentMutationDto {
  const mutation = asRecord(value);
  if (!(mutation && isComment(mutation.comment) && isMetadata(mutation.metadata))) {
    invalidResponse('um comentario');
  }
  return mutation as unknown as TaskCommentMutationDto;
}

function parseTagMutation(value: unknown): TaskTagMutationDto {
  const mutation = asRecord(value);
  if (!(mutation && isTag(mutation.tag) && isMetadata(mutation.metadata))) {
    invalidResponse('uma tag');
  }
  return mutation as unknown as TaskTagMutationDto;
}

function parseDelete(value: unknown): TaskDeleteDto {
  const deletion = asRecord(value);
  if (!(deletion && typeof deletion.deleted === 'boolean' && isMetadata(deletion.metadata))) {
    invalidResponse('uma confirmacao de exclusao');
  }
  return deletion as unknown as TaskDeleteDto;
}

function toTaskInput(input: CreateTaskInput | UpdateTaskInput) {
  return {
    ...(input.assigned_to !== undefined ? { assignedTo: input.assigned_to } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.due_date !== undefined ? { dueDate: input.due_date } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.project_id !== undefined ? { projectId: input.project_id } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
  };
}

export const tasksService = {
  async listTasks(signal?: AbortSignal): Promise<Task[]> {
    const response = await invokeEdgeFunction<unknown>('tasks', {
      auth: 'required',
      body: {
        action: 'list_tasks',
        filters: {},
        order: 'createdAtDesc',
        page: 1,
        pageSize: 1_000,
      },
      signal,
      timeoutMs: TASKS_TIMEOUT_MS,
    });
    return parseTasksPage(response).items.map(mapTask);
  },

  async getTaskDetail(taskId: string, signal?: AbortSignal): Promise<TaskDetail> {
    const response = await invokeEdgeFunction<unknown>('tasks', {
      auth: 'required',
      body: { action: 'get_task_detail', taskId },
      signal,
      timeoutMs: TASKS_TIMEOUT_MS,
    });
    const detail = parseTaskDetail(response);
    return {
      comments: detail.comments.map(mapTaskComment),
      tags: detail.tags.map(mapTaskTag),
      task: mapTask(detail.task),
    };
  },

  async createTask(input: CreateTaskInput): Promise<Task> {
    const response = await invokeEdgeFunction<unknown>('tasks', {
      auth: 'required',
      body: { action: 'create_task', input: toTaskInput(input) },
      timeoutMs: TASKS_TIMEOUT_MS,
    });
    return mapTask(parseTaskMutation(response).task);
  },

  async updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
    const response = await invokeEdgeFunction<unknown>('tasks', {
      auth: 'required',
      body: { action: 'update_task', input: toTaskInput(input), taskId: id },
      timeoutMs: TASKS_TIMEOUT_MS,
    });
    return mapTask(parseTaskMutation(response).task);
  },

  async deleteTask(id: string): Promise<void> {
    const response = await invokeEdgeFunction<unknown>('tasks', {
      auth: 'required',
      body: { action: 'delete_task', taskId: id },
      timeoutMs: TASKS_TIMEOUT_MS,
    });
    if (!parseDelete(response).deleted) invalidResponse('uma confirmacao de exclusao');
  },

  async addComment(taskId: string, comment: string): Promise<TaskComment> {
    const response = await invokeEdgeFunction<unknown>('tasks', {
      auth: 'required',
      body: { action: 'add_comment', comment, taskId },
      timeoutMs: TASKS_TIMEOUT_MS,
    });
    return mapTaskComment(parseCommentMutation(response).comment);
  },

  async deleteComment(taskId: string, commentId: string): Promise<boolean> {
    const response = await invokeEdgeFunction<unknown>('tasks', {
      auth: 'required',
      body: { action: 'delete_comment', commentId, taskId },
      timeoutMs: TASKS_TIMEOUT_MS,
    });
    return parseDelete(response).deleted;
  },

  async addTag(taskId: string, tag: AddTaskTagInput): Promise<Tag> {
    const response = await invokeEdgeFunction<unknown>('tasks', {
      auth: 'required',
      body: { action: 'add_tag', tag, taskId },
      timeoutMs: TASKS_TIMEOUT_MS,
    });
    return mapTaskTag(parseTagMutation(response).tag);
  },

  async removeTag(taskId: string, tagId: string): Promise<boolean> {
    const response = await invokeEdgeFunction<unknown>('tasks', {
      auth: 'required',
      body: { action: 'remove_tag', tagId, taskId },
      timeoutMs: TASKS_TIMEOUT_MS,
    });
    return parseDelete(response).deleted;
  },
};
