import { ApiError } from '../_shared/http/mod.ts'
import {
  TASKS_CONTRACT_VERSION,
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
} from './contract.ts'
import type {
  TasksPayload,
  UpdateTaskPayload,
} from './payload.ts'
import type {
  TaskCommentRecord,
  TaskRecord,
  TaskTagRecord,
  TasksRepository,
} from './repository.ts'
import {
  assertValidTaskStatusTransition,
  normalizeTaskPriority,
  normalizeTaskStatus,
} from './rules.ts'

export const TASKS_VIEW_PERMISSION = 'tasks.view'

function metadata(now = new Date()): TasksMetadataDto {
  return {
    contractVersion: TASKS_CONTRACT_VERSION,
    generatedAt: now.toISOString(),
  }
}
function toTagDto(tag: TaskTagRecord): TaskTagDto {
  return { ...tag }
}

function toCommentDto(comment: TaskCommentRecord): TaskCommentDto {
  return { ...comment }
}

function toTaskDto(task: TaskRecord): TaskDto {
  return {
    ...task,
    aiTags: [...task.aiTags],
    priority: normalizeTaskPriority(task.priority),
    status: normalizeTaskStatus(task.status),
    tags: task.tags.map(toTagDto),
  }
}

async function accessibleTask(
  repository: TasksRepository,
  actorId: string,
  taskId: string,
): Promise<TaskRecord> {
  const task = await repository.findAccessibleTask(actorId, taskId)
  if (!task) throw ApiError.notFound('Task not found')
  return task
}

async function ownedTask(
  repository: TasksRepository,
  actorId: string,
  taskId: string,
): Promise<TaskRecord> {
  const task = await repository.findOwnedTask(actorId, taskId)
  if (!task) throw ApiError.notFound('Task not found')
  return task
}

export async function authorizeTasksAction(
  repository: TasksRepository,
  actorId: string,
  _payload: TasksPayload,
): Promise<boolean> {
  return repository.userHasPermission(actorId, TASKS_VIEW_PERMISSION)
}

async function listTasks(
  repository: TasksRepository,
  actorId: string,
  payload: Extract<TasksPayload, { action: 'list_tasks' }>,
): Promise<TasksPageDto> {
  const page = await repository.listTasksPage({
    actorId,
    dueFrom: payload.filters.dueFrom,
    dueTo: payload.filters.dueTo,
    limit: payload.pageSize,
    offset: (payload.page - 1) * payload.pageSize,
    priority: payload.filters.priority,
    status: payload.filters.status,
    suggestedByAi: payload.filters.suggestedByAi,
    tagSearch: payload.filters.tagSearch,
  })
  return {
    items: page.items.map(toTaskDto),
    metadata: metadata(),
    page: payload.page,
    pageSize: payload.pageSize,
    totalCount: page.totalCount,
    totalPages: Math.ceil(page.totalCount / payload.pageSize),
  }
}

async function getTaskDetail(
  repository: TasksRepository,
  actorId: string,
  taskId: string,
): Promise<TaskDetailDto> {
  const task = await accessibleTask(repository, actorId, taskId)
  const [comments, tags] = await Promise.all([
    repository.listComments(taskId),
    repository.listTags(taskId),
  ])
  return {
    comments: comments.map(toCommentDto),
    metadata: metadata(),
    tags: tags.map(toTagDto),
    task: toTaskDto({ ...task, tags }),
  }
}

function changesForUpdate(task: TaskRecord, payload: UpdateTaskPayload) {
  const currentByField: Record<keyof UpdateTaskPayload['input'], unknown> = {
    assignedTo: task.assignedTo,
    description: task.description,
    dueDate: task.dueDate,
    priority: task.priority,
    projectId: task.projectId,
    status: task.status,
    title: task.title,
  }
  return Object.entries(payload.input)
    .filter(([field, value]) => currentByField[field as keyof typeof currentByField] !== value)
    .map(([field, value]) => ({
      field,
      newValue: value,
      oldValue: currentByField[field as keyof typeof currentByField],
    }))
}

export async function executeTasks(
  repository: TasksRepository,
  actorId: string,
  payload: TasksPayload,
): Promise<
  | TasksPageDto
  | TaskDetailDto
  | TaskMutationDto
  | TaskCommentMutationDto
  | TaskTagMutationDto
  | TaskDeleteDto
> {
  switch (payload.action) {
    case 'list_tasks':
      return listTasks(repository, actorId, payload)
    case 'get_task_detail':
      return getTaskDetail(repository, actorId, payload.taskId)
    case 'create_task': {
      const task = await repository.createTask(actorId, payload.input)
      return { metadata: metadata(), task: toTaskDto(task) }
    }
    case 'update_task': {
      const current = await accessibleTask(repository, actorId, payload.taskId)
      if (payload.input.status !== undefined) {
        assertValidTaskStatusTransition(current.status, payload.input.status)
      }
      const changes = changesForUpdate(current, payload)
      if (changes.length === 0) {
        return { metadata: metadata(), task: toTaskDto(current) }
      }
      const task = await repository.updateTask(actorId, payload.taskId, payload.input)
      if (!task) throw ApiError.notFound('Task not found')
      await repository.recordHistory(actorId, payload.taskId, changes)
      return { metadata: metadata(), task: toTaskDto(task) }
    }
    case 'delete_task': {
      await ownedTask(repository, actorId, payload.taskId)
      const deleted = await repository.deleteTask(actorId, payload.taskId)
      if (!deleted) throw ApiError.notFound('Task not found')
      return { deleted: true, metadata: metadata() }
    }
    case 'add_comment': {
      await accessibleTask(repository, actorId, payload.taskId)
      const comment = await repository.addComment(actorId, payload.taskId, payload.comment)
      return { comment: toCommentDto(comment), metadata: metadata() }
    }
    case 'delete_comment': {
      await accessibleTask(repository, actorId, payload.taskId)
      const deleted = await repository.deleteComment(actorId, payload.commentId)
      return { deleted, metadata: metadata() }
    }
    case 'add_tag': {
      await accessibleTask(repository, actorId, payload.taskId)
      const tag = await repository.addTag(actorId, payload.taskId, payload.tag)
      return { metadata: metadata(), tag: toTagDto(tag) }
    }
    case 'remove_tag': {
      await ownedTask(repository, actorId, payload.taskId)
      const deleted = await repository.removeTag(payload.taskId, payload.tagId)
      return { deleted, metadata: metadata() }
    }
  }
}
