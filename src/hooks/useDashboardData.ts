import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { WeeklySummary, PendingTask, Student, ActivityFeedItem, RiskLevel, TaskStatus, TaskPriority, TaskType } from '@/types';
import { startOfWeek, subWeeks, isPast, addDays } from 'date-fns';

type TaskStudentSummary = {
  id: string;
  full_name: string;
  current_risk_level: RiskLevel;
  email?: string | null;
};

type FeedStudentSummary = {
  id: string;
  full_name: string;
};

export function useDashboardData(selectedWeek: 'current' | 'last' = 'current', courseFilter?: string) {
  const { user } = useAuth();
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [criticalStudents, setCriticalStudents] = useState<Student[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityFeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Calculate week boundaries
      const now = new Date();
      const weekStart = selectedWeek === 'current' 
        ? startOfWeek(now, { weekStartsOn: 1 })
        : startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

      // Get user's courses where they are a tutor
      const { data: userCourses } = await supabase
        .from('user_courses')
        .select('course_id')
        .eq('user_id', user.id)
        .eq('role', 'tutor');

      const courseIds = courseFilter && courseFilter !== 'all'
        ? [courseFilter]
        : userCourses?.map(uc => uc.course_id) || [];

      if (courseIds.length === 0) {
        setSummary({
          pending_tasks: 0,
          overdue_tasks: 0,
          students_at_risk: 0,
          new_at_risk_this_week: 0,
        });
        setPendingTasks([]);
        setCriticalStudents([]);
        setActivityFeed([]);
        setIsLoading(false);
        return;
      }

      // Get students in courses (excluding suspended)
      const { data: studentCourses } = await supabase
        .from('student_courses')
        .select('student_id, enrollment_status')
        .in('course_id', courseIds)
        .neq('enrollment_status', 'suspenso');

      const studentIds = [...new Set(studentCourses?.map(sc => sc.student_id) || [])];

      // Fetch pending tasks
      const { data: tasksData, count: pendingTasksCount } = await supabase
        .from('pending_tasks')
        .select(`
          *,
          students (id, full_name, current_risk_level, email)
        `, { count: 'exact' })
        .in('student_id', studentIds.length > 0 ? studentIds : [''])
        .neq('status', 'resolvida');

      // Fetch students at risk
      const { data: atRiskStudents } = await supabase
        .from('students')
        .select('*')
        .in('id', studentIds.length > 0 ? studentIds : [''])
        .in('current_risk_level', ['risco', 'critico']);

      // Fetch new at-risk changes this week
      const { count: newAtRisk } = await supabase
        .from('risk_history')
        .select('*', { count: 'exact', head: true })
        .in('student_id', studentIds.length > 0 ? studentIds : [''])
        .in('new_level', ['risco', 'critico'])
        .gte('created_at', weekStart.toISOString());

      // Fetch activity feed
      const { data: feedData } = await supabase
        .from('activity_feed')
        .select(`
          *,
          students (id, full_name)
        `)
        .or(`user_id.eq.${user.id},student_id.in.(${studentIds.join(',')})`)
        .order('created_at', { ascending: false })
        .limit(20);

      const overdueTasksCount = (tasksData || []).filter(task => {
        if (!task.due_date) return false;
        return isPast(new Date(task.due_date)) && task.status !== 'resolvida';
      }).length;

      // Set summary
      setSummary({
        pending_tasks: pendingTasksCount || 0,
        overdue_tasks: overdueTasksCount,
        students_at_risk: atRiskStudents?.length || 0,
        new_at_risk_this_week: newAtRisk || 0,
      });

      // Set pending tasks with proper typing
      const typedTasks: PendingTask[] = (tasksData || []).map(task => {
        const relatedStudent = task.students as TaskStudentSummary | null;

        return {
          id: task.id,
          student_id: task.student_id,
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
          created_at: task.created_at || new Date().toISOString(),
          updated_at: task.updated_at || new Date().toISOString(),
          student: relatedStudent ? {
            id: relatedStudent.id,
            moodle_user_id: '',
            full_name: relatedStudent.full_name,
            current_risk_level: relatedStudent.current_risk_level,
            created_at: '',
            updated_at: '',
          } : undefined,
        };
      });

      setPendingTasks(typedTasks);

      // Set critical students
      const typedStudents: Student[] = (atRiskStudents || []).map(s => ({
        id: s.id,
        moodle_user_id: s.moodle_user_id,
        full_name: s.full_name,
        email: s.email || undefined,
        avatar_url: s.avatar_url || undefined,
        current_risk_level: s.current_risk_level as RiskLevel,
        risk_reasons: s.risk_reasons || undefined,
        tags: s.tags || undefined,
        last_access: s.last_access || undefined,
        created_at: s.created_at || new Date().toISOString(),
        updated_at: s.updated_at || new Date().toISOString(),
      }));

      setCriticalStudents(typedStudents);

      // Set activity feed
      const typedFeed: ActivityFeedItem[] = (feedData || []).map(item => {
        const feedStudent = item.students as FeedStudentSummary | null;

        return {
          id: item.id,
          user_id: item.user_id || undefined,
          student_id: item.student_id || undefined,
          course_id: item.course_id || undefined,
          event_type: item.event_type,
          title: item.title,
          description: item.description || undefined,
          metadata: item.metadata as Record<string, unknown> | undefined,
          created_at: item.created_at || new Date().toISOString(),
          student: feedStudent ? {
            id: feedStudent.id,
            moodle_user_id: '',
            full_name: feedStudent.full_name,
            current_risk_level: 'normal' as RiskLevel,
            created_at: '',
            updated_at: '',
          } : undefined,
        };
      });

      setActivityFeed(typedFeed);

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  }, [user, selectedWeek, courseFilter]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Compute derived data
  const overdueTasks = pendingTasks.filter(task => {
    if (!task.due_date) return false;
    return isPast(new Date(task.due_date)) && task.status !== 'resolvida';
  });

  const upcomingTasks = pendingTasks.filter(task => {
    if (!task.due_date) return false;
    const dueDate = new Date(task.due_date);
    const threeDaysFromNow = addDays(new Date(), 3);
    return dueDate <= threeDaysFromNow && !isPast(dueDate) && task.status !== 'resolvida';
  });

  return {
    summary,
    pendingTasks,
    overdueTasks,
    upcomingTasks,
    criticalStudents,
    activityFeed,
    isLoading,
    error,
    refetch: fetchDashboardData,
  };
}
