import { supabase } from '@/integrations/supabase/client';
import type { Task, TaskComment, TaskHistoryEntry, Tag, TaskStatus, TaskPriority } from '@/types';

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigned_to?: string;
  due_date?: string;
  project_id?: string;
  created_by?: string;
  tags?: string[];
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {
  status?: TaskStatus;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toTask(row: any): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    assigned_to: row.assigned_to,
    created_by: row.created_by,
    due_date: row.due_date,
    project_id: row.project_id,
    suggested_by_ai: row.suggested_by_ai ?? false,
    origin_reason: row.origin_reason ?? null,
    entity_type: row.entity_type ?? null,
    entity_id: row.entity_id ?? null,
    // The `tasks.tags` DB column is a text[] of AI-generated tag strings.
    // Mapped to `ai_tags` on the Task type to distinguish from the separate
    // `task_tags` join-table relation (stored in the `tags` field as Tag[]).
    ai_tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    tags: [],
  };
}

export const tasksService = {
  async listTasks(): Promise<Task[]> {
    const { data, error } = await supabase
      .from('tasks' as never)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map(toTask);
  },

  async getTask(id: string): Promise<Task | null> {
    const { data, error } = await supabase
      .from('tasks' as never)
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data ? toTask(data as any) : null;
  },

  async createTask(input: CreateTaskInput): Promise<Task> {
    const { data, error } = await supabase
      .from('tasks' as never)
      .insert(input as never)
      .select()
      .single();
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return toTask(data as any);
  },

  async updateTask(id: string, input: UpdateTaskInput, changedBy?: string): Promise<Task> {
    const { data: oldData } = await supabase
      .from('tasks' as never)
      .select('*')
      .eq('id', id)
      .single();

    const { data, error } = await supabase
      .from('tasks' as never)
      .update(input as never)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    if (oldData && changedBy) {
      const trackedFields: (keyof UpdateTaskInput)[] = ['title', 'description', 'status', 'priority', 'assigned_to', 'due_date'];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const old = oldData as any;
      const historyEntries = trackedFields
        .filter(field => input[field] !== undefined && (old[field] ?? null) !== (input[field] ?? null))
        .map(field => ({
          task_id: id,
          field_changed: field,
          old_value: old[field] != null ? String(old[field]) : null,
          new_value: input[field] != null ? String(input[field]) : null,
          changed_by: changedBy,
        }));
      if (historyEntries.length > 0) {
        await supabase.from('task_history' as never).insert(historyEntries as never);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return toTask(data as any);
  },

  async deleteTask(id: string): Promise<void> {
    const { error } = await supabase.from('tasks' as never).delete().eq('id', id);
    if (error) throw error;
  },

  async listComments(taskId: string): Promise<TaskComment[]> {
    const { data, error } = await supabase
      .from('task_comments' as never)
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as TaskComment[];
  },

  async addComment(taskId: string, comment: string, authorId: string): Promise<TaskComment> {
    const { data, error } = await supabase
      .from('task_comments' as never)
      .insert({ task_id: taskId, comment, author_id: authorId } as never)
      .select()
      .single();
    if (error) throw error;
    return data as TaskComment;
  },

  async deleteComment(id: string): Promise<void> {
    const { error } = await supabase.from('task_comments' as never).delete().eq('id', id);
    if (error) throw error;
  },

  async listHistory(taskId: string): Promise<TaskHistoryEntry[]> {
    const { data, error } = await supabase
      .from('task_history' as never)
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as TaskHistoryEntry[];
  },

  async getTaskTags(taskId: string): Promise<Tag[]> {
    const { data, error } = await supabase
      .from('task_tags' as never)
      .select('tag_id, tags(*)')
      .eq('task_id', taskId);
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((row: any) => row.tags as Tag).filter(Boolean);
  },

  async addTagToTask(taskId: string, tagId: string): Promise<void> {
    const { error } = await supabase
      .from('task_tags' as never)
      .insert({ task_id: taskId, tag_id: tagId } as never);
    if (error && error.code !== '23505') throw error;
  },

  async removeTagFromTask(taskId: string, tagId: string): Promise<void> {
    const { error } = await supabase
      .from('task_tags' as never)
      .delete()
      .eq('task_id', taskId)
      .eq('tag_id', tagId);
    if (error) throw error;
  },

  async findOrCreateTag(label: string, prefix?: string, entityId?: string, entityType?: string, createdBy?: string): Promise<Tag> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from('tags' as never) as any).select('*').eq('label', label);
    if (entityId) query = query.eq('entity_id', entityId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows } = await query.limit(1) as { data: any[] | null };
    if (rows && rows.length > 0) return rows[0] as Tag;

    const { data, error } = await supabase
      .from('tags' as never)
      .insert({
        label,
        prefix: prefix ?? null,
        entity_id: entityId ?? null,
        entity_type: entityType ?? 'custom',
        created_by: createdBy ?? null,
      } as never)
      .select()
      .single();
    if (error) throw error;
    return data as Tag;
  },

  async searchTags(search: string): Promise<Tag[]> {
    const { data, error } = await supabase
      .from('tags' as never)
      .select('*')
      .ilike('label', `%${search}%`)
      .limit(20);
    if (error) throw error;
    return (data ?? []) as Tag[];
  },
};
