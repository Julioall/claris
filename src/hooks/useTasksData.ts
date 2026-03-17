import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { InternalTask, InternalTaskStatus, InternalTaskPriority, InternalTaskComment } from '@/types';

interface InternalTaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string | null;
  created_by_user_id: string | null;
  assigned_to_user_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  project_id: string | null;
  teams_task_id: string | null;
  created_at: string;
  updated_at: string | null;
}

interface TaskCommentRow {
  id: string;
  task_id: string;
  user_id: string | null;
  content: string;
  created_at: string;
}

function rowToTask(row: InternalTaskRow): InternalTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    status: (row.status as InternalTaskStatus) ?? 'backlog',
    priority: (row.priority as InternalTaskPriority) ?? 'media',
    category: row.category ?? undefined,
    created_by_user_id: row.created_by_user_id ?? undefined,
    assigned_to_user_id: row.assigned_to_user_id ?? undefined,
    due_date: row.due_date ?? undefined,
    completed_at: row.completed_at ?? undefined,
    project_id: row.project_id ?? undefined,
    teams_task_id: row.teams_task_id ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at ?? undefined,
  };
}

export function useTasksData() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<InternalTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!user) {
      setTasks([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await (supabase as unknown as {
        from: (table: string) => {
          select: (q: string) => {
            or: (q: string) => {
              order: (col: string, opts: { ascending: boolean }) => Promise<{ data: InternalTaskRow[] | null; error: Error | null }>;
            };
          };
        };
      }).from('internal_tasks')
        .select('*')
        .or(`created_by_user_id.eq.${user.id},assigned_to_user_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setTasks((data ?? []).map(rowToTask));
    } catch (err) {
      console.error('Error fetching internal tasks:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar tarefas');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const createTask = useCallback(async (payload: {
    title: string;
    description?: string;
    priority?: InternalTaskPriority;
    category?: string;
    assigned_to_user_id?: string;
    due_date?: string;
  }) => {
    if (!user) return false;

    try {
      const { error: insertError } = await (supabase as unknown as {
        from: (table: string) => {
          insert: (row: Record<string, unknown>) => Promise<{ error: Error | null }>;
        };
      }).from('internal_tasks').insert({
        title: payload.title,
        description: payload.description ?? null,
        status: 'backlog',
        priority: payload.priority ?? 'media',
        category: payload.category ?? null,
        created_by_user_id: user.id,
        assigned_to_user_id: payload.assigned_to_user_id ?? null,
        due_date: payload.due_date ?? null,
      });

      if (insertError) throw insertError;

      await fetchTasks();
      return true;
    } catch (err) {
      console.error('Error creating internal task:', err);
      return false;
    }
  }, [user, fetchTasks]);

  const updateTaskStatus = useCallback(async (taskId: string, status: InternalTaskStatus) => {
    try {
      const { error: updateError } = await (supabase as unknown as {
        from: (table: string) => {
          update: (row: Record<string, unknown>) => {
            eq: (col: string, val: string) => Promise<{ error: Error | null }>;
          };
        };
      }).from('internal_tasks')
        .update({
          status,
          completed_at: status === 'concluida' ? new Date().toISOString() : null,
        })
        .eq('id', taskId);

      if (updateError) throw updateError;

      await fetchTasks();
      return true;
    } catch (err) {
      console.error('Error updating internal task status:', err);
      return false;
    }
  }, [fetchTasks]);

  const deleteTask = useCallback(async (taskId: string) => {
    try {
      const { error: deleteError } = await (supabase as unknown as {
        from: (table: string) => {
          delete: () => {
            eq: (col: string, val: string) => Promise<{ error: Error | null }>;
          };
        };
      }).from('internal_tasks')
        .delete()
        .eq('id', taskId);

      if (deleteError) throw deleteError;

      await fetchTasks();
      return true;
    } catch (err) {
      console.error('Error deleting internal task:', err);
      return false;
    }
  }, [fetchTasks]);

  const addComment = useCallback(async (taskId: string, content: string): Promise<InternalTaskComment | null> => {
    if (!user) return null;

    try {
      const { data, error: insertError } = await (supabase as unknown as {
        from: (table: string) => {
          insert: (row: Record<string, unknown>) => {
            select: (q: string) => {
              single: () => Promise<{ data: TaskCommentRow | null; error: Error | null }>;
            };
          };
        };
      }).from('internal_task_comments')
        .insert({ task_id: taskId, user_id: user.id, content })
        .select('id, task_id, user_id, content, created_at')
        .single();

      if (insertError) throw insertError;
      if (!data) return null;

      return {
        id: data.id,
        task_id: data.task_id,
        user_id: data.user_id ?? undefined,
        content: data.content,
        created_at: data.created_at,
      };
    } catch (err) {
      console.error('Error adding task comment:', err);
      return null;
    }
  }, [user]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return { tasks, isLoading, error, refetch: fetchTasks, createTask, updateTaskStatus, deleteTask, addComment };
}
