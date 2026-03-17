import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  WeeklySummary,
  Student,
  ActivityFeedItem,
  DashboardReviewActivity,
  RiskLevel,
} from '@/types';
import { startOfWeek, subWeeks } from 'date-fns';

type FeedStudentSummary = {
  id: string;
  full_name: string;
};

type ReviewActivityStudentSummary = {
  id: string;
  full_name: string;
  current_risk_level: RiskLevel | null;
};

type ReviewActivityCourseSummary = {
  id: string;
  name: string;
  short_name?: string | null;
};

type ReviewActivityRow = {
  id: string;
  student_id: string;
  course_id: string;
  activity_name: string;
  due_date: string | null;
  submitted_at: string | null;
  students: ReviewActivityStudentSummary | null;
  courses: ReviewActivityCourseSummary | null;
};

const EMPTY_SUMMARY: WeeklySummary = {
  pending_tasks: 0,
  overdue_tasks: 0,
  activities_to_review: 0,
  active_normal_students: 0,
  pending_submission_assignments: 0,
  pending_correction_assignments: 0,
  students_at_risk: 0,
  new_at_risk_this_week: 0,
};

function mapActivityFeedItems(items: Array<Record<string, unknown>>): ActivityFeedItem[] {
  return items.map(item => {
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
}

export function useDashboardData(selectedWeek: 'current' | 'last' = 'current', courseFilter?: string) {
  const { user } = useAuth();
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [criticalStudents, setCriticalStudents] = useState<Student[]>([]);
  const [activitiesToReview, setActivitiesToReview] = useState<DashboardReviewActivity[]>([]);
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
        setSummary({ ...EMPTY_SUMMARY });
        setCriticalStudents([]);
        setActivitiesToReview([]);
        setActivityFeed([]);
        setIsLoading(false);
        return;
      }

      // Get students in courses and defensively exclude any suspended enrollment
      const { data: studentCourses } = await supabase
        .from('student_courses')
        .select('student_id, enrollment_status')
        .in('course_id', courseIds);

      const normalizeEnrollmentStatus = (status: string | null | undefined) =>
        (status || '').trim().toLowerCase();

      const suspendedStudentIds = new Set(
        (studentCourses || [])
          .filter(sc => normalizeEnrollmentStatus(sc.enrollment_status) === 'suspenso')
          .map(sc => sc.student_id)
      );

      const studentIds = [...new Set(
        (studentCourses || [])
          .filter(sc => !suspendedStudentIds.has(sc.student_id))
          .map(sc => sc.student_id)
      )];

      const activeStudentIds = [...new Set(
        (studentCourses || [])
          .filter(sc => normalizeEnrollmentStatus(sc.enrollment_status) === 'ativo')
          .map(sc => sc.student_id)
      )];

      const feedFilter = studentIds.length > 0
        ? `user_id.eq.${user.id},student_id.in.(${studentIds.join(',')})`
        : `user_id.eq.${user.id}`;

      if (studentIds.length === 0) {
        let feedQuery = supabase
          .from('activity_feed')
          .select(`
            *,
            students (id, full_name)
          `)
          .or(feedFilter);

        if (courseFilter && courseFilter !== 'all') {
          feedQuery = feedQuery.eq('course_id', courseFilter);
        }

        const { data: feedData, error: feedError } = await feedQuery
          .order('created_at', { ascending: false })
          .limit(20);

        if (feedError) throw feedError;

        setSummary({ ...EMPTY_SUMMARY });
        setCriticalStudents([]);
        setActivitiesToReview([]);
        setActivityFeed(mapActivityFeedItems((feedData || []) as Array<Record<string, unknown>>));
        setIsLoading(false);
        return;
      }

      const nowIso = now.toISOString();

      let feedQuery = supabase
        .from('activity_feed')
        .select(`
          *,
          students (id, full_name)
        `)
        .or(feedFilter);

      if (courseFilter && courseFilter !== 'all') {
        feedQuery = feedQuery.eq('course_id', courseFilter);
      }

      const [
        pendingTasksCountResponse,
        atRiskStudentsResponse,
        activeNormalStudentsResponse,
        newAtRiskResponse,
        feedResponse,
        missedAssignmentsResponse,
        uncorrectedActivitiesResponse,
      ] = await Promise.all([
        supabase
          .from('pending_tasks')
          .select('id', { count: 'exact', head: true })
          .in('student_id', studentIds)
          .neq('status', 'resolvida'),
        supabase
          .from('students')
          .select('*')
          .in('id', studentIds)
          .in('current_risk_level', ['risco', 'critico']),
        supabase
          .from('students')
          .select('id', { count: 'exact', head: true })
          .in('id', activeStudentIds.length > 0 ? activeStudentIds : ['__none__'])
          .eq('current_risk_level', 'normal'),
        supabase
          .from('risk_history')
          .select('*', { count: 'exact', head: true })
          .in('student_id', studentIds)
          .in('new_level', ['risco', 'critico'])
          .gte('created_at', weekStart.toISOString()),
        feedQuery
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('student_activities')
          .select('id', { count: 'exact', head: true })
          .in('course_id', courseIds)
          .in('student_id', studentIds)
          .eq('activity_type', 'assign')
          .not('due_date', 'is', null)
          .lt('due_date', nowIso)
          .is('submitted_at', null)
          .eq('hidden', false),
        supabase
          .from('student_activities')
          .select(`
            id,
            student_id,
            course_id,
            activity_name,
            due_date,
            submitted_at,
            students!inner (id, full_name, current_risk_level),
            courses!inner (id, name, short_name)
          `)
          .in('course_id', courseIds)
          .in('student_id', studentIds)
          .eq('activity_type', 'assign')
          .is('graded_at', null)
          .eq('hidden', false)
          .not('submitted_at', 'is', null),
      ]);

      const { count: pendingTasksCount, error: pendingTasksError } = pendingTasksCountResponse;
      const { data: atRiskStudents, error: atRiskStudentsError } = atRiskStudentsResponse;
      const { count: activeNormalStudentsCount, error: activeNormalStudentsError } = activeNormalStudentsResponse;
      const { count: newAtRisk, error: newAtRiskError } = newAtRiskResponse;
      const { data: feedData, error: feedError } = feedResponse;
      const { count: missedAssignmentsCount, error: missedAssignmentsError } = missedAssignmentsResponse;
      const { data: uncorrectedActivities, error: uncorrectedActivitiesError } = uncorrectedActivitiesResponse;

      if (pendingTasksError) throw pendingTasksError;
      if (atRiskStudentsError) throw atRiskStudentsError;
      if (activeNormalStudentsError) throw activeNormalStudentsError;
      if (newAtRiskError) throw newAtRiskError;
      if (feedError) throw feedError;
      if (missedAssignmentsError) throw missedAssignmentsError;
      if (uncorrectedActivitiesError) throw uncorrectedActivitiesError;

      // Set summary
      setSummary({
        pending_tasks: pendingTasksCount || 0,
        overdue_tasks: 0,
        activities_to_review: uncorrectedActivities?.length || 0,
        active_normal_students: activeNormalStudentsCount || 0,
        pending_submission_assignments: missedAssignmentsCount || 0,
        pending_correction_assignments: uncorrectedActivities?.length || 0,
        students_at_risk: atRiskStudents?.length || 0,
        new_at_risk_this_week: newAtRisk || 0,
      });

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
      }))
        .sort((a, b) => {
          const riskOrder: Record<RiskLevel, number> = {
            critico: 0,
            risco: 1,
            atencao: 2,
            normal: 3,
            inativo: 4,
          };

          return riskOrder[a.current_risk_level] - riskOrder[b.current_risk_level];
        });

      setCriticalStudents(typedStudents);

      const typedActivitiesToReview: DashboardReviewActivity[] = ((uncorrectedActivities || []) as ReviewActivityRow[])
        .map(activity => {
          const relatedStudent = activity.students as ReviewActivityStudentSummary | null;
          const relatedCourse = activity.courses as ReviewActivityCourseSummary | null;

          return {
            id: activity.id,
            activity_name: activity.activity_name,
            student_id: activity.student_id,
            course_id: activity.course_id,
            due_date: activity.due_date || undefined,
            submitted_at: activity.submitted_at || undefined,
            student: {
              id: relatedStudent?.id || activity.student_id,
              full_name: relatedStudent?.full_name || 'Aluno sem nome',
              current_risk_level: (relatedStudent?.current_risk_level || 'normal') as RiskLevel,
            },
            course: {
              id: relatedCourse?.id || activity.course_id,
              name: relatedCourse?.name || 'Curso',
              short_name: relatedCourse?.short_name || undefined,
            },
          };
        })
        .sort((a, b) => {
          const dueDateA = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
          const dueDateB = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;

          if (dueDateA !== dueDateB) {
            return dueDateA - dueDateB;
          }

          const submittedAtA = a.submitted_at ? new Date(a.submitted_at).getTime() : Number.POSITIVE_INFINITY;
          const submittedAtB = b.submitted_at ? new Date(b.submitted_at).getTime() : Number.POSITIVE_INFINITY;
          return submittedAtA - submittedAtB;
        });

      setActivitiesToReview(typedActivitiesToReview);

      // Set activity feed
      setActivityFeed(mapActivityFeedItems((feedData || []) as Array<Record<string, unknown>>));

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

  return {
    summary,
    criticalStudents,
    activitiesToReview,
    activityFeed,
    isLoading,
    error,
    refetch: fetchDashboardData,
  };
}
