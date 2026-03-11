import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { RecurrencePattern, RecurrenceWeekday, TaskStatus, TaskPriority, TaskType } from '@/types';
import { calculateNextRecurringDate } from '@/lib/task-recurrence';

type PendingTaskRow = Database['public']['Tables']['pending_tasks']['Row'] & {
  is_recurring?: boolean | null;
  recurrence_id?: string | null;
  parent_task_id?: string | null;
  students?: Pick<Database['public']['Tables']['students']['Row'], 'id' | 'full_name'> | null;
  courses?: Pick<Database['public']['Tables']['courses']['Row'], 'id' | 'short_name'> | null;
};

type PendingTaskInsert = Database['public']['Tables']['pending_tasks']['Insert'];
type PendingTaskInsertPayload = PendingTaskInsert & {
  recurrence_id?: string | null;
  is_recurring?: boolean;
  parent_task_id?: string | null;
};

interface PendingTaskWithRelations {
  id: string;
  student_id?: string;
  course_id?: string;
  category_name?: string;
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
  automation_type?: string;
  is_recurring?: boolean;
  recurrence_id?: string;
  parent_task_id?: string;
  created_at: string;
  updated_at?: string;
  student?: {
    id: string;
    full_name: string;
  };
  course?: {
    id: string;
    short_name: string;
  };
}

interface RecurrenceConfig {
  id: string;
  title: string;
  description?: string | null;
  pattern: RecurrencePattern;
  weekly_day?: RecurrenceWeekday | null;
  start_date: string;
  end_date?: string | null;
}

interface RecurrenceQueryResult<TData> {
  data: TData | null;
  error: Error | null;
}

interface RecurrenceTableClient {
  select: (query: string) => {
    eq: (column: string, value: string) => {
      maybeSingle?: () => Promise<RecurrenceQueryResult<RecurrenceConfig>>;
      single: () => Promise<RecurrenceQueryResult<RecurrenceConfig>>;
    };
  };
  update: (payload: { last_generated_at: string; next_generation_at: string }) => {
    eq: (column: string, value: string) => Promise<RecurrenceQueryResult<null>>;
  };
}

export function usePendingTasksData() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<PendingTaskWithRelations[]>([]);
  const [courses, setCourses] = useState<{ id: string; short_name: string }[]>([]);
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
      // Fetch tasks created by or assigned to the user, or related to their courses
      const { data, error: fetchError } = await supabase
        .from('pending_tasks')
        .select(`
          *,
          students (
            id,
            full_name
          ),
          courses (
            id,
            short_name
          )
        `)
        .or(`created_by_user_id.eq.${user.id},assigned_to_user_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const formattedTasks: PendingTaskWithRelations[] = ((data || []) as PendingTaskRow[]).map(task => ({
        id: task.id,
        student_id: task.student_id || undefined,
        course_id: task.course_id || undefined,
        category_name: task.category_name || undefined,
        created_by_user_id: task.created_by_user_id || undefined,
        assigned_to_user_id: task.assigned_to_user_id || undefined,
        title: task.title,
        description: task.description || undefined,
        task_type: (task.task_type || 'interna') as TaskType,
        status: (task.status || 'aberta') as TaskStatus,
        priority: (task.priority || 'media') as TaskPriority,
        due_date: task.due_date || undefined,
        completed_at: task.completed_at || undefined,
        moodle_activity_id: task.moodle_activity_id || undefined,
        automation_type: task.automation_type || 'manual',
        is_recurring: task.is_recurring || false,
        recurrence_id: task.recurrence_id || undefined,
        parent_task_id: task.parent_task_id || undefined,
        created_at: task.created_at || new Date().toISOString(),
        updated_at: task.updated_at || undefined,
        student: task.students ? {
          id: task.students.id,
          full_name: task.students.full_name,
        } : undefined,
        course: task.courses ? {
          id: task.courses.id,
          short_name: task.courses.short_name,
        } : undefined,
      }));

      setTasks(formattedTasks);

      // Extract unique courses for filtering
      const uniqueCourses = Array.from(
        new Map(
          formattedTasks
            .filter(t => t.course)
            .map(t => [t.course!.id, t.course!])
        ).values()
      );
      setCourses(uniqueCourses);
    } catch (err) {
      console.error('Error fetching pending tasks:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar pendências');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const maybeCreateNextRecurringTask = useCallback(async (
    task: PendingTaskWithRelations,
    completedAt: string,
  ) => {
    if (!task.recurrence_id || !task.is_recurring || !user) {
      return;
    }

    const recurrenceTable = (supabase.from as unknown as (table: 'task_recurrence_configs') => RecurrenceTableClient)('task_recurrence_configs');
    const recurrenceQuery = recurrenceTable
      .select('id, title, description, pattern, weekly_day, start_date, end_date')
      .eq('id', task.recurrence_id);

    const recurrenceResult = recurrenceQuery.maybeSingle
      ? await recurrenceQuery.maybeSingle()
      : await recurrenceQuery.single();

    if (recurrenceResult.error || !recurrenceResult.data) {
      throw recurrenceResult.error ?? new Error('Recurring configuration not found');
    }

    const recurrence = recurrenceResult.data as RecurrenceConfig;
    const scheduleReference = new Date(Math.max(
      new Date(completedAt).getTime(),
      new Date(task.due_date ?? recurrence.start_date).getTime(),
    ));
    const nextDueDate = calculateNextRecurringDate({
      pattern: recurrence.pattern,
      startDate: recurrence.start_date,
      referenceDate: scheduleReference,
      weeklyDay: recurrence.weekly_day,
    });

    if (recurrence.end_date && nextDueDate > new Date(recurrence.end_date)) {
      return;
    }

    const { data: existingTasks, error: existingError } = await supabase
      .from('pending_tasks')
      .select('id')
      .eq('recurrence_id' as any, task.recurrence_id)
      .neq('status', 'resolvida')
      .limit(1);

    if (existingError) throw existingError;
    if (existingTasks && existingTasks.length > 0) return;

    const { error: insertError } = await supabase
      .from('pending_tasks')
      .insert({
        title: recurrence.title || task.title,
        description: recurrence.description ?? task.description ?? null,
        student_id: task.student_id || null,
        course_id: task.course_id || null,
        created_by_user_id: user.id,
        assigned_to_user_id: task.assigned_to_user_id || null,
        category_name: task.category_name || null,
        task_type: task.task_type,
        priority: task.priority,
        status: 'aberta',
        due_date: nextDueDate.toISOString(),
        automation_type: 'recurring',
        recurrence_id: task.recurrence_id,
        is_recurring: true,
        parent_task_id: task.id,
        template_id: null,
      } satisfies PendingTaskInsertPayload);

    if (insertError) throw insertError;

    const nextGenerationAt = calculateNextRecurringDate({
      pattern: recurrence.pattern,
      startDate: recurrence.start_date,
      referenceDate: nextDueDate,
      weeklyDay: recurrence.weekly_day,
    });

    await recurrenceTable
      .update({
        last_generated_at: completedAt,
        next_generation_at: nextGenerationAt.toISOString(),
      })
      .eq('id', task.recurrence_id);
  }, [user]);

  const updateTaskStatus = useCallback(async (taskId: string, status: TaskStatus) => {
    const now = new Date().toISOString();
    const task = tasks.find((item) => item.id === taskId);

    try {
      const { error: updateError } = await supabase
        .from('pending_tasks')
        .update({
          status,
          completed_at: status === 'resolvida' ? now : null,
        })
        .eq('id', taskId);

      if (updateError) throw updateError;

      if (status === 'resolvida' && task && task.status !== 'resolvida') {
        try {
          await maybeCreateNextRecurringTask(task, now);
        } catch (recurrenceError) {
          console.error('Error creating next recurring task:', recurrenceError);
        }
      }

      await fetchTasks();
      return true;
    } catch (err) {
      console.error('Error updating task status:', err);
      return false;
    }
  }, [fetchTasks, maybeCreateNextRecurringTask, tasks]);

  const markAsResolved = useCallback(async (taskId: string) => {
    return updateTaskStatus(taskId, 'resolvida');
  }, [updateTaskStatus]);

  const deleteTask = useCallback(async (taskId: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('pending_tasks')
        .delete()
        .eq('id', taskId);

      if (deleteError) throw deleteError;

      await fetchTasks();
      return true;
    } catch (err) {
      console.error('Error deleting task:', err);
      return false;
    }
  }, [fetchTasks]);

  const createTask = useCallback(async (taskData: {
    student_id?: string;
    course_id?: string;
    title: string;
    description?: string;
    task_type: TaskType;
    priority: TaskPriority;
    due_date?: string;
    category_name?: string;
    template_id?: string;
  }) => {
    if (!user) return false;

    try {
      const { error: insertError } = await supabase
        .from('pending_tasks')
        .insert({
          ...taskData,
          student_id: taskData.student_id || null,
          created_by_user_id: user.id,
          status: 'aberta',
        } satisfies PendingTaskInsertPayload);

      if (insertError) throw insertError;

      await fetchTasks();
      return true;
    } catch (err) {
      console.error('Error creating task:', err);
      return false;
    }
  }, [user, fetchTasks]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return { 
    tasks, 
    courses,
    isLoading, 
    error, 
    refetch: fetchTasks, 
    markAsResolved,
    updateTaskStatus,
    createTask,
    deleteTask
  };
}
