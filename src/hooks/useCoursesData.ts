import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Course } from '@/types';
import { getCourseLifecycleStatus, withEffectiveCourseDates } from '@/lib/course-dates';

interface CourseWithStats extends Course {
  students_count: number;
  at_risk_count: number;
}

export function useCoursesData() {
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
      // Get user's courses where they are a tutor
      const { data: userCourses, error: userCoursesError } = await supabase
        .from('user_courses')
        .select(`
          course_id,
          role,
          courses (*)
        `)
        .eq('user_id', user.id)
        .eq('role','tutor');

      if (userCoursesError) throw userCoursesError;

      if (!userCourses || userCourses.length === 0) {
        setCourses([]);
        setIsLoading(false);
        return;
      }

      // Extract courses
      const coursesData = userCourses
        .map(uc => uc.courses)
        .filter((c): c is NonNullable<typeof c> => c !== null);
      const datedCourses = withEffectiveCourseDates(coursesData);

      // Get stats for each course
      const coursesWithStats: CourseWithStats[] = await Promise.all(
        datedCourses.map(async (course) => {
          const isCourseInProgress = getCourseLifecycleStatus(course) === 'em_andamento';

          // Count students in this course
          const { count: studentsCount } = await supabase
            .from('student_courses')
            .select('*', { count: 'exact', head: true })
            .eq('course_id', course.id);

          let atRiskCount = 0;
          if (isCourseInProgress) {
            // Count at-risk students only for ongoing courses
            const { data: atRiskData } = await supabase
              .from('student_courses')
              .select(`
                student_id,
                students!inner (current_risk_level)
              `)
              .eq('course_id', course.id);

            atRiskCount = atRiskData?.filter(
              sc => sc.students && ['risco', 'critico'].includes((sc.students as { current_risk_level: string }).current_risk_level)
            ).length || 0;
          }

          return {
            ...course,
            students_count: studentsCount || 0,
            at_risk_count: atRiskCount,
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

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  return { courses, isLoading, error, refetch: fetchCourses };
}
