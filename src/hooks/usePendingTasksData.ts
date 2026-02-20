import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { TaskStatus, TaskPriority, TaskType } from '@/types';

interface PendingTaskWithRelations {
  id: string;
  student_id?: string;
  course_id?: string;
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

      const formattedTasks: PendingTaskWithRelations[] = (data || []).map(task => ({
        id: task.id,
        student_id: task.student_id || undefined,
        course_id: task.course_id || undefined,
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
        automation_type: (task as any).automation_type || 'manual',
        is_recurring: (task as any).is_recurring || false,
        recurrence_id: (task as any).recurrence_id || undefined,
        parent_task_id: (task as any).parent_task_id || undefined,
        created_at: task.created_at || new Date().toISOString(),
        updated_at: task.updated_at || undefined,
        student: task.students ? {
          id: (task.students as any).id,
          full_name: (task.students as any).full_name,
        } : undefined,
        course: task.courses ? {
          id: (task.courses as any).id,
          short_name: (task.courses as any).short_name,
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

  const markAsResolved = useCallback(async (taskId: string) => {
    try {
      const { error: updateError } = await supabase
        .from('pending_tasks')
        .update({
          status: 'resolvida',
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      if (updateError) throw updateError;

      await fetchTasks();
      return true;
    } catch (err) {
      console.error('Error marking task as resolved:', err);
    return false;
    }
  }, [fetchTasks]);

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
    student_id: string;
    course_id?: string;
    title: string;
    description?: string;
    task_type: TaskType;
    priority: TaskPriority;
    due_date?: string;
  }) => {
    if (!user) return false;

    try {
      const { error: insertError } = await supabase
        .from('pending_tasks')
        .insert({
          ...taskData,
          created_by_user_id: user.id,
          status: 'aberta',
        });

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
    createTask,
    deleteTask
  };
}
