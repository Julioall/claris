import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Course } from '@/types';

interface CourseWithStats extends Course {
  students_count: number;
  at_risk_count: number;
  pending_tasks_count: number;
  is_following: boolean;
}

export function useAllCoursesData() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<CourseWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCourses = useCallback(async () => {
    if (!user) {
      setCourses([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get ALL courses (not filtered by user)
      const { data: allCourses, error: coursesError } = await supabase
        .from('courses')
        .select('*')
        .order('name');

      if (coursesError) throw coursesError;

      if (!allCourses || allCourses.length === 0) {
        setCourses([]);
        setIsLoading(false);
        return;
      }

      // Get user's followed courses
      const { data: userCourses } = await supabase
        .from('user_courses')
        .select('course_id')
        .eq('user_id', user.id);

      const followedCourseIds = new Set(userCourses?.map(uc => uc.course_id) || []);

      // Get stats for each course
      const coursesWithStats: CourseWithStats[] = await Promise.all(
        allCourses.map(async (course) => {
          // Count students in this course
          const { count: studentsCount } = await supabase
            .from('student_courses')
            .select('*', { count: 'exact', head: true })
            .eq('course_id', course.id);

          // Count at-risk students
          const { data: atRiskData } = await supabase
            .from('student_courses')
            .select(`
              student_id,
              students!inner (current_risk_level)
            `)
            .eq('course_id', course.id);

          const atRiskCount = atRiskData?.filter(
            sc => sc.students && ['risco', 'critico'].includes((sc.students as any).current_risk_level)
          ).length || 0;

          // Count pending tasks
          const { count: pendingTasksCount } = await supabase
            .from('pending_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('course_id', course.id)
            .neq('status', 'resolvida');

          return {
            ...course,
            students_count: studentsCount || 0,
            at_risk_count: atRiskCount,
            pending_tasks_count: pendingTasksCount || 0,
            is_following: followedCourseIds.has(course.id),
          } as CourseWithStats;
        })
      );

      setCourses(coursesWithStats);
    } catch (err) {
      console.error('Error fetching courses:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar cursos');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const toggleFollow = useCallback(async (courseId: string) => {
    if (!user) return;

    const course = courses.find(c => c.id === courseId);
    if (!course) return;

    try {
      if (course.is_following) {
        // Remove from user_courses
        await supabase
          .from('user_courses')
          .delete()
          .eq('user_id', user.id)
          .eq('course_id', courseId);
      } else {
        // Add to user_courses
        await supabase
          .from('user_courses')
          .insert({
            user_id: user.id,
            course_id: courseId,
            role: 'tutor'
          });
      }

      // Update local state
      setCourses(prev => prev.map(c => 
        c.id === courseId 
          ? { ...c, is_following: !c.is_following }
          : c
      ));
    } catch (err) {
      console.error('Error toggling follow:', err);
      throw err;
    }
  }, [user, courses]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  return { courses, isLoading, error, refetch: fetchCourses, toggleFollow };
}
