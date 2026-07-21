import {
  RequestBodyValidationError,
  expectBodyObject,
} from '../_shared/http/mod.ts'
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriorityDto,
  type TaskStatusDto,
} from './contract.ts'

export interface ListTasksPayload {
  action: 'list_tasks'
  filters: {
    dueFrom?: string
    dueTo?: string
    priority?: TaskPriorityDto
    status?: TaskStatusDto
    suggestedByAi?: boolean
    tagSearch?: string
  }
  order: 'createdAtDesc'
  page: number
  pageSize: number
}

export interface GetTaskDetailPayload {
  action: 'get_task_detail'
  taskId: string
}

export interface TaskWritableFields {
  assignedTo?: string | null
  description?: string | null
  dueDate?: string | null
  priority?: TaskPriorityDto
  projectId?: string | null
  status?: TaskStatusDto
  title?: string
}

export interface CreateTaskPayload {
  action: 'create_task'
  input: TaskWritableFields & { title: string }
}

export interface UpdateTaskPayload {
  action: 'update_task'
  input: TaskWritableFields
  taskId: string
}

export interface DeleteTaskPayload {
  action: 'delete_task'
  taskId: string
}

export interface AddTaskCommentPayload {
  action: 'add_comment'
  comment: string
  taskId: string
}

export interface DeleteTaskCommentPayload {
  action: 'delete_comment'
  commentId: string
  taskId: string
}

export interface AddTaskTagPayload {
  action: 'add_tag'
  tag: {
    entityId?: string
    entityType?: string
    label: string
    prefix?: string
  }
  taskId: string
}

export interface RemoveTaskTagPayload {
  action: 'remove_tag'
  tagId: string
  taskId: string
}

export type TasksPayload =
  | ListTasksPayload
  | GetTaskDetailPayload
  | CreateTaskPayload
  | UpdateTaskPayload
  | DeleteTaskPayload
  | AddTaskCommentPayload
  | DeleteTaskCommentPayload
  | AddTaskTagPayload
  | RemoveTaskTagPayload

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_PAGE = 1_000_000
const MAX_PAGE_SIZE = 1_000

function invalid(field: string): never {
  throw new RequestBodyValidationError(`Invalid ${field}`, 422)
}

function ensureExactFields(body: Record<string, unknown>, allowedFields: string[]) {
  const allowed = new Set(allowedFields)
  if (Object.keys(body).some((field) => !allowed.has(field))) invalid('request fields')
}

function parseObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(field)
  return value as Record<string, unknown>
}

function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) invalid(field)
  return value
}

function parseNullableUuid(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return parseUuid(value, field)
}

function parseString(
  value: unknown,
  field: string,
  maximum: number,
  options: { nullable?: boolean; required?: boolean; trim?: boolean } = {},
): string | null | undefined {
  if (value === undefined) {
    if (options.required) invalid(field)
    return undefined
  }
  if (value === null) {
    if (!options.nullable) invalid(field)
    return null
  }
  if (typeof value !== 'string') invalid(field)
  const parsed = options.trim === false ? value : value.trim()
  if ((options.required && !parsed) || parsed.length > maximum) invalid(field)
  return parsed
}

function parseDate(value: unknown, field: string, nullable = false): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) {
    if (!nullable) invalid(field)
    return null
  }
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) invalid(field)
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) invalid(field)
  return value
}

function parsePositiveInteger(value: unknown, field: string, fallback: number, maximum: number): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) invalid(field)
  return value as number
}

function parseFilters(value: unknown): ListTasksPayload['filters'] {
  if (value === undefined) return {}
  const filters = parseObject(value, 'filters')
  ensureExactFields(filters, ['dueFrom', 'dueTo', 'priority', 'status', 'suggestedByAi', 'tagSearch'])
  const parsed: ListTasksPayload['filters'] = {}

  const dueFrom = parseDate(filters.dueFrom, 'filters.dueFrom')
  const dueTo = parseDate(filters.dueTo, 'filters.dueTo')
  if (dueFrom) parsed.dueFrom = dueFrom
  if (dueTo) parsed.dueTo = dueTo
  if (dueFrom && dueTo && dueFrom > dueTo) invalid('filters date range')

  if (filters.priority !== undefined) {
    if (typeof filters.priority !== 'string' || !TASK_PRIORITIES.includes(filters.priority as TaskPriorityDto)) {
      invalid('filters.priority')
    }
    parsed.priority = filters.priority as TaskPriorityDto
  }
  if (filters.status !== undefined) {
    if (typeof filters.status !== 'string' || !TASK_STATUSES.includes(filters.status as TaskStatusDto)) {
      invalid('filters.status')
    }
    parsed.status = filters.status as TaskStatusDto
  }
  if (filters.suggestedByAi !== undefined) {
    if (typeof filters.suggestedByAi !== 'boolean') invalid('filters.suggestedByAi')
    parsed.suggestedByAi = filters.suggestedByAi
  }
  const tagSearch = parseString(filters.tagSearch, 'filters.tagSearch', 100)
  if (tagSearch) parsed.tagSearch = tagSearch
  return parsed
}

function parseWritableFields(value: unknown, create: boolean): TaskWritableFields & { title?: string } {
  const input = parseObject(value, 'input')
  ensureExactFields(input, ['assignedTo', 'description', 'dueDate', 'priority', 'projectId', 'status', 'title'])
  if (!create && Object.keys(input).length === 0) invalid('input')

  const parsed: TaskWritableFields & { title?: string } = {}
  const title = parseString(input.title, 'input.title', 240, { required: create })
  if (title !== undefined && title !== null) parsed.title = title

  const description = parseString(input.description, 'input.description', 8_000, { nullable: true, trim: false })
  if (description !== undefined) parsed.description = description
  const dueDate = parseDate(input.dueDate, 'input.dueDate', true)
  if (dueDate !== undefined) parsed.dueDate = dueDate
  const assignedTo = parseNullableUuid(input.assignedTo, 'input.assignedTo')
  if (assignedTo !== undefined) parsed.assignedTo = assignedTo
  const projectId = parseNullableUuid(input.projectId, 'input.projectId')
  if (projectId !== undefined) parsed.projectId = projectId

  if (input.priority !== undefined) {
    if (typeof input.priority !== 'string' || !TASK_PRIORITIES.includes(input.priority as TaskPriorityDto)) {
      invalid('input.priority')
    }
    parsed.priority = input.priority as TaskPriorityDto
  }
  if (input.status !== undefined) {
    if (typeof input.status !== 'string' || !TASK_STATUSES.includes(input.status as TaskStatusDto)) {
      invalid('input.status')
    }
    parsed.status = input.status as TaskStatusDto
  }
  return parsed
}

export function parseTasksPayload(rawBody: unknown): TasksPayload {
  const body = expectBodyObject(rawBody)

  switch (body.action) {
    case 'list_tasks': {
      ensureExactFields(body, ['action', 'filters', 'order', 'page', 'pageSize'])
      if (body.order !== undefined && body.order !== 'createdAtDesc') invalid('order')
      return {
        action: 'list_tasks',
        filters: parseFilters(body.filters),
        order: 'createdAtDesc',
        page: parsePositiveInteger(body.page, 'page', 1, MAX_PAGE),
        pageSize: parsePositiveInteger(body.pageSize, 'pageSize', 100, MAX_PAGE_SIZE),
      }
    }
    case 'get_task_detail':
    case 'delete_task': {
      ensureExactFields(body, ['action', 'taskId'])
      return { action: body.action, taskId: parseUuid(body.taskId, 'taskId') }
    }
    case 'create_task': {
      ensureExactFields(body, ['action', 'input'])
      const input = parseWritableFields(body.input, true)
      return { action: 'create_task', input: input as CreateTaskPayload['input'] }
    }
    case 'update_task': {
      ensureExactFields(body, ['action', 'input', 'taskId'])
      return {
        action: 'update_task',
        input: parseWritableFields(body.input, false),
        taskId: parseUuid(body.taskId, 'taskId'),
      }
    }
    case 'add_comment': {
      ensureExactFields(body, ['action', 'comment', 'taskId'])
      const comment = parseString(body.comment, 'comment', 4_000, { required: true })
      return {
        action: 'add_comment',
        comment: (comment as string).trim(),
        taskId: parseUuid(body.taskId, 'taskId'),
      }
    }
    case 'delete_comment': {
      ensureExactFields(body, ['action', 'commentId', 'taskId'])
      return {
        action: 'delete_comment',
        commentId: parseUuid(body.commentId, 'commentId'),
        taskId: parseUuid(body.taskId, 'taskId'),
      }
    }
    case 'add_tag': {
      ensureExactFields(body, ['action', 'tag', 'taskId'])
      const tag = parseObject(body.tag, 'tag')
      ensureExactFields(tag, ['entityId', 'entityType', 'label', 'prefix'])
      const label = parseString(tag.label, 'tag.label', 160, { required: true }) as string
      const prefix = parseString(tag.prefix, 'tag.prefix', 50)
      const entityId = parseString(tag.entityId, 'tag.entityId', 240)
      const entityType = parseString(tag.entityType, 'tag.entityType', 50)
      return {
        action: 'add_tag',
        tag: {
          ...(entityId ? { entityId } : {}),
          ...(entityType ? { entityType } : {}),
          label,
          ...(prefix ? { prefix } : {}),
        },
        taskId: parseUuid(body.taskId, 'taskId'),
      }
    }
    case 'remove_tag': {
      ensureExactFields(body, ['action', 'tagId', 'taskId'])
      return {
        action: 'remove_tag',
        tagId: parseUuid(body.tagId, 'tagId'),
        taskId: parseUuid(body.taskId, 'taskId'),
      }
    }
    default:
      invalid('action')
  }
}
