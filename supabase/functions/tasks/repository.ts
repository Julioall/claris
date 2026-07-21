import {
  userHasPermission as checkPermission,
} from '../_shared/auth/mod.ts'
import {
  createServiceClient,
  type AppSupabaseClient,
} from '../_shared/db/mod.ts'
import type {
  TaskPriorityDto,
  TaskStatusDto,
} from './contract.ts'
import type { TaskWritableFields } from './payload.ts'

export interface TaskTagRecord {
  color: string | null
  createdAt: string
  entityId: string | null
  entityType: string | null
  id: string
  label: string
  prefix: string | null
}

export interface TaskRecord {
  aiTags: string[]
  assignedTo: string | null
  createdAt: string
  createdBy: string | null
  description: string | null
  dueDate: string | null
  entityId: string | null
  entityType: string | null
  id: string
  originReason: string | null
  priority: string
  projectId: string | null
  status: string
  suggestedByAi: boolean
  tags: TaskTagRecord[]
  title: string
  updatedAt: string
}

export interface TaskCommentRecord {
  authorId: string | null
  comment: string
  createdAt: string
  id: string
  taskId: string
}

export interface TaskPageRecord {
  items: TaskRecord[]
  totalCount: number
}

export interface TasksRepository {
  addComment(actorId: string, taskId: string, comment: string): Promise<TaskCommentRecord>
  addTag(actorId: string, taskId: string, tag: {
    entityId?: string
    entityType?: string
    label: string
    prefix?: string
  }): Promise<TaskTagRecord>
  createTask(actorId: string, input: TaskWritableFields & { title: string }): Promise<TaskRecord>
  deleteComment(actorId: string, commentId: string): Promise<boolean>
  deleteTask(actorId: string, taskId: string): Promise<boolean>
  findAccessibleTask(actorId: string, taskId: string): Promise<TaskRecord | null>
  findOwnedTask(actorId: string, taskId: string): Promise<TaskRecord | null>
  listComments(taskId: string): Promise<TaskCommentRecord[]>
  listTags(taskId: string): Promise<TaskTagRecord[]>
  listTasksPage(input: {
    actorId: string
    dueFrom?: string
    dueTo?: string
    limit: number
    offset: number
    priority?: TaskPriorityDto
    status?: TaskStatusDto
    suggestedByAi?: boolean
    tagSearch?: string
  }): Promise<TaskPageRecord>
  recordHistory(actorId: string, taskId: string, changes: Array<{
    field: string
    newValue: unknown
    oldValue: unknown
  }>): Promise<void>
  removeTag(taskId: string, tagId: string): Promise<boolean>
  updateTask(actorId: string, taskId: string, input: TaskWritableFields): Promise<TaskRecord | null>
  userHasPermission(userId: string, permission: string): Promise<boolean>
}

type TaskRow = {
  assigned_to: string | null
  created_at: string
  created_by: string | null
  description: string | null
  due_date: string | null
  entity_id: string | null
  entity_type: string | null
  id: string
  origin_reason: string | null
  priority: string
  project_id: string | null
  status: string
  suggested_by_ai: boolean
  tags: string[] | null
  title: string
  updated_at: string
  linked_tags?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function parseTag(value: unknown): TaskTagRecord {
  const tag = asRecord(value)
  if (!tag
    || typeof tag.id !== 'string'
    || typeof tag.label !== 'string'
    || typeof tag.created_at !== 'string'
    || (tag.prefix !== null && tag.prefix !== undefined && typeof tag.prefix !== 'string')
    || (tag.entity_id !== null && tag.entity_id !== undefined && typeof tag.entity_id !== 'string')
    || (tag.entity_type !== null && tag.entity_type !== undefined && typeof tag.entity_type !== 'string')
    || (tag.color !== null && tag.color !== undefined && typeof tag.color !== 'string')) {
    throw new Error('Invalid backend task tag row')
  }
  return {
    color: typeof tag.color === 'string' ? tag.color : null,
    createdAt: tag.created_at,
    entityId: typeof tag.entity_id === 'string' ? tag.entity_id : null,
    entityType: typeof tag.entity_type === 'string' ? tag.entity_type : null,
    id: tag.id,
    label: tag.label,
    prefix: typeof tag.prefix === 'string' ? tag.prefix : null,
  }
}
function toTask(row: TaskRow, linkedTags: TaskTagRecord[] = []): TaskRecord {
  return {
    aiTags: Array.isArray(row.tags) ? row.tags.filter((value): value is string => typeof value === 'string') : [],
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
    createdBy: row.created_by,
    description: row.description,
    dueDate: row.due_date,
    entityId: row.entity_id,
    entityType: row.entity_type,
    id: row.id,
    originReason: row.origin_reason,
    priority: row.priority,
    projectId: row.project_id,
    status: row.status,
    suggestedByAi: row.suggested_by_ai,
    tags: linkedTags,
    title: row.title,
    updatedAt: row.updated_at,
  }
}

function parseTask(value: unknown): TaskRecord {
  const row = asRecord(value)
  if (!row
    || typeof row.id !== 'string'
    || typeof row.title !== 'string'
    || typeof row.status !== 'string'
    || typeof row.priority !== 'string'
    || typeof row.suggested_by_ai !== 'boolean'
    || typeof row.created_at !== 'string'
    || typeof row.updated_at !== 'string') {
    throw new Error('Invalid backend task row')
  }
  const linkedTags = row.linked_tags === undefined
    ? []
    : Array.isArray(row.linked_tags)
      ? row.linked_tags.map(parseTag)
      : (() => { throw new Error('Invalid backend task tags') })()
  return toTask(row as unknown as TaskRow, linkedTags)
}

function parseTasksPage(value: unknown): TaskPageRecord {
  const page = asRecord(value)
  if (!page || !Array.isArray(page.items)
    || !Number.isSafeInteger(page.total_count) || (page.total_count as number) < 0) {
    throw new Error('Invalid backend tasks page')
  }
  return {
    items: page.items.map(parseTask),
    totalCount: page.total_count as number,
  }
}

function mapTaskPatch(input: TaskWritableFields) {
  return {
    ...(input.assignedTo !== undefined ? { assigned_to: input.assignedTo } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.projectId !== undefined ? { project_id: input.projectId } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
  }
}

async function loadTaskTags(supabase: AppSupabaseClient, taskId: string): Promise<TaskTagRecord[]> {
  const { data: links, error: linksError } = await supabase
    .from('task_tags')
    .select('tag_id')
    .eq('task_id', taskId)
    .order('tag_id')
  if (linksError) throw linksError
  const tagIds = [...new Set((links ?? []).map((link) => link.tag_id))]
  if (tagIds.length === 0) return []

  const { data, error } = await supabase
    .from('tags')
    .select('id, label, prefix, entity_id, entity_type, color, created_at')
    .in('id', tagIds)
    .order('label')
    .order('id')
  if (error) throw error
  return (data ?? []).map(parseTag)
}

async function loadTask(
  supabase: AppSupabaseClient,
  actorId: string,
  taskId: string,
  ownedOnly: boolean,
): Promise<TaskRecord | null> {
  let query = supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
  query = ownedOnly
    ? query.eq('created_by', actorId)
    : query.or(`created_by.eq.${actorId},assigned_to.eq.${actorId}`)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  if (!data) return null
  return toTask(data, await loadTaskTags(supabase, taskId))
}

export function createTasksRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): TasksRepository {
  return {
    async userHasPermission(userId, permission) {
      return checkPermission(supabase, userId, permission)
    },

    async listTasksPage(input) {
      const { data, error } = await supabase.rpc('backend_list_tasks_page' as never, {
        p_due_from: input.dueFrom ?? null,
        p_due_to: input.dueTo ?? null,
        p_limit: input.limit,
        p_offset: input.offset,
        p_priority: input.priority ?? null,
        p_status: input.status ?? null,
        p_suggested_by_ai: input.suggestedByAi ?? null,
        p_tag_search: input.tagSearch ?? null,
        p_user_id: input.actorId,
      } as never)
      if (error) throw error
      return parseTasksPage(data)
    },

    findAccessibleTask(actorId, taskId) {
      return loadTask(supabase, actorId, taskId, false)
    },

    findOwnedTask(actorId, taskId) {
      return loadTask(supabase, actorId, taskId, true)
    },

    async listComments(taskId) {
      const { data, error } = await supabase
        .from('task_comments')
        .select('id, task_id, author_id, comment, created_at')
        .eq('task_id', taskId)
        .order('created_at')
        .order('id')
      if (error) throw error
      return (data ?? []).map((row) => ({
        authorId: row.author_id,
        comment: row.comment,
        createdAt: row.created_at,
        id: row.id,
        taskId: row.task_id,
      }))
    },

    listTags(taskId) {
      return loadTaskTags(supabase, taskId)
    },

    async createTask(actorId, input) {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          ...mapTaskPatch(input),
          created_by: actorId,
          title: input.title,
        })
        .select()
        .single()
      if (error) throw error
      return toTask(data)
    },

    async updateTask(actorId, taskId, input) {
      const { data, error } = await supabase
        .from('tasks')
        .update(mapTaskPatch(input))
        .eq('id', taskId)
        .or(`created_by.eq.${actorId},assigned_to.eq.${actorId}`)
        .select()
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return toTask(data, await loadTaskTags(supabase, taskId))
    },

    async deleteTask(actorId, taskId) {
      const { data, error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId)
        .eq('created_by', actorId)
        .select('id')
        .maybeSingle()
      if (error) throw error
      return Boolean(data)
    },

    async addComment(actorId, taskId, comment) {
      const { data, error } = await supabase
        .from('task_comments')
        .insert({ author_id: actorId, comment, task_id: taskId })
        .select('id, task_id, author_id, comment, created_at')
        .single()
      if (error) throw error
      return {
        authorId: data.author_id,
        comment: data.comment,
        createdAt: data.created_at,
        id: data.id,
        taskId: data.task_id,
      }
    },

    async deleteComment(actorId, commentId) {
      const { data, error } = await supabase
        .from('task_comments')
        .delete()
        .eq('id', commentId)
        .eq('author_id', actorId)
        .select('id')
        .maybeSingle()
      if (error) throw error
      return Boolean(data)
    },

    async addTag(actorId, taskId, tag) {
      const { data, error } = await supabase.rpc('backend_add_task_tag' as never, {
        p_actor_id: actorId,
        p_entity_id: tag.entityId ?? null,
        p_entity_type: tag.entityType ?? null,
        p_label: tag.label,
        p_prefix: tag.prefix ?? null,
        p_task_id: taskId,
      } as never)
      if (error) throw error
      return parseTag(data)
    },

    async removeTag(taskId, tagId) {
      const { data, error } = await supabase
        .from('task_tags')
        .delete()
        .eq('task_id', taskId)
        .eq('tag_id', tagId)
        .select('task_id')
        .maybeSingle()
      if (error) throw error
      return Boolean(data)
    },

    async recordHistory(actorId, taskId, changes) {
      if (changes.length === 0) return
      const { error } = await supabase.from('task_history').insert(changes.map((change) => ({
        changed_by: actorId,
        field_changed: change.field,
        new_value: change.newValue === null || change.newValue === undefined ? null : String(change.newValue),
        old_value: change.oldValue === null || change.oldValue === undefined ? null : String(change.oldValue),
        task_id: taskId,
      })))
      if (error) throw error
    },
  }
}
