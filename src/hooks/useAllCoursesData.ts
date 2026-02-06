import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Course } from '@/types';

interface CourseWithStats extends Course {
  students_count: number;
  at_risk_count: number;
  pending_tasks_count: number;
  is_following: boolean;
  is_ignored: boolean;
  student_ids: string[];
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
      // Get courses where user is a tutor
      const { data: userCourses, error: userCoursesError } = await supabase
        .from('user_courses')
        .select('course_id, role')
        .eq('user_id', user.id);

      if (userCoursesError) throw userCoursesError;

      if (!userCourses || userCourses.length === 0) {
        setCourses([]);
        setIsLoading(false);
        return;
      }

      // Get only the course IDs where user is tutor
      const tutorCourseIds = userCourses
        .filter(uc => uc.role === 'tutor')
        .map(uc => uc.course_id);

      if (tutorCourseIds.length === 0) {
        setCourses([]);
        setIsLoading(false);
        return;
      }

      // Get course details only for courses where user is tutor
      const { data: allCourses, error: coursesError } = await supabase
        .from('courses')
        .select('*')
        .in('id', tutorCourseIds)
        .order('name');

      if (coursesError) throw coursesError;

      if (!allCourses || allCourses.length === 0) {
        setCourses([]);
        setIsLoading(false);
        return;
      }

      const followedCourseIds = new Set(tutorCourseIds);

      // Get user's ignored courses
      const { data: ignoredCourses } = await supabase
        .from('user_ignored_courses')
        .select('course_id')
        .eq('user_id', user.id);

      const ignoredCourseIds = new Set(ignoredCourses?.map(ic => ic.course_id) || []);

      // Get stats for each course
      const coursesWithStats: CourseWithStats[] = await Promise.all(
        allCourses.map(async (course) => {
          // Count students in this course
          const { data: studentData } = await supabase
            .from('student_courses')
            .select('student_id')
            .eq('course_id', course.id);

          const studentIds = studentData?.map(s => s.student_id) || [];

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
            students_count: studentIds.length,
            student_ids: studentIds,
            at_risk_count: atRiskCount,
            pending_tasks_count: pendingTasksCount || 0,
            is_following: followedCourseIds.has(course.id),
            is_ignored: ignoredCourseIds.has(course.id),
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

  const toggleIgnore = useCallback(async (courseId: string) => {
    if (!user) return;

    const course = courses.find(c => c.id === courseId);
    if (!course) return;

    try {
      if (course.is_ignored) {
        // Remove from ignored
        await supabase
          .from('user_ignored_courses')
          .delete()
          .eq('user_id', user.id)
          .eq('course_id', courseId);
      } else {
        // Add to ignored
        await supabase
          .from('user_ignored_courses')
          .insert({
            user_id: user.id,
            course_id: courseId
          });
      }

      // Update local state
      setCourses(prev => prev.map(c => 
        c.id === courseId 
          ? { ...c, is_ignored: !c.is_ignored }
          : c
      ));
    } catch (err) {
      console.error('Error toggling ignore:', err);
      throw err;
    }
  }, [user, courses]);

  const toggleIgnoreMultiple = useCallback(async (courseIds: string[], shouldIgnore: boolean) => {
    if (!user || courseIds.length === 0) return;

    try {
      if (shouldIgnore) {
        // Get current ignored to avoid duplicates
        const currentlyIgnored = courses
          .filter(c => courseIds.includes(c.id) && c.is_ignored)
          .map(c => c.id);
        
        const toInsert = courseIds
          .filter(id => !currentlyIgnored.includes(id))
          .map(course_id => ({
            user_id: user.id,
            course_id
          }));

        if (toInsert.length > 0) {
          await supabase
            .from('user_ignored_courses')
            .insert(toInsert);
        }
      } else {
        // Remove from ignored
        await supabase
          .from('user_ignored_courses')
          .delete()
          .eq('user_id', user.id)
          .in('course_id', courseIds);
      }

      // Update local state
      setCourses(prev => prev.map(c => 
        courseIds.includes(c.id)
          ? { ...c, is_ignored: shouldIgnore }
          : c
      ));
    } catch (err) {
      console.error('Error toggling ignore multiple:', err);
      throw err;
    }
  }, [user, courses]);

  const unfollowMultiple = useCallback(async (courseIds: string[]) => {
    if (!user || courseIds.length === 0) return;

    try {
      await supabase
        .from('user_courses')
        .delete()
        .eq('user_id', user.id)
        .in('course_id', courseIds);

      // Update local state
      setCourses(prev => prev.map(c => 
        courseIds.includes(c.id)
          ? { ...c, is_following: false }
          : c
      ));
    } catch (err) {
      console.error('Error unfollowing multiple:', err);
      throw err;
    }
  }, [user, courses]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  return { 
    courses, 
    isLoading, 
    error, 
    refetch: fetchCourses, 
    toggleFollow, 
    toggleIgnore, 
    toggleIgnoreMultiple,
    unfollowMultiple 
  };
}
