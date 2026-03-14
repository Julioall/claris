import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/contexts/AuthContext';
import { Course } from '@/types';
import { withEffectiveCourseDates } from '@/lib/course-dates';

interface CourseWithStats extends Course {
  students_count: number;
  at_risk_count: number;
  pending_tasks_count: number;
  is_following: boolean;
  is_ignored: boolean;
  is_attendance_enabled: boolean;
  student_ids: string[];
}

type StudentCourseRiskRow = {
  students: {
    current_risk_level: string;
  } | null;
};

export function useAllCoursesData() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<CourseWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setCourseAssociationRole = useCallback(async (courseId: string, role: 'tutor' | 'viewer') => {
    if (!user) return;

    const { error: deleteError } = await supabase
      .from('user_courses')
      .delete()
      .eq('user_id', user.id)
      .eq('course_id', courseId);

    if (deleteError) throw deleteError;

    const { error: insertError } = await supabase
      .from('user_courses')
      .insert({
        user_id: user.id,
        course_id: courseId,
        role,
      });

    if (insertError) throw insertError;
  }, [user]);

  const setCoursesAssociationRole = useCallback(async (courseIds: string[], role: 'tutor' | 'viewer') => {
    if (!user || courseIds.length === 0) return;

    const { error: deleteError } = await supabase
      .from('user_courses')
      .delete()
      .eq('user_id', user.id)
      .in('course_id', courseIds);

    if (deleteError) throw deleteError;

    const { error: insertError } = await supabase
      .from('user_courses')
      .insert(
        courseIds.map(course_id => ({
          user_id: user.id,
          course_id,
          role,
        }))
      );

    if (insertError) throw insertError;
  }, [user]);

  const fetchCourses = useCallback(async () => {
    if (!user) {
      setCourses([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get courses followed by the user (used only to mark is_following)
      const { data: userCourses, error: userCoursesError } = await supabase
        .from('user_courses')
        .select('course_id, role')
        .eq('user_id', user.id);

      if (userCoursesError) throw userCoursesError;

      // Get only the course IDs where user is tutor
      const tutorCourseIds = (userCourses || [])
        .filter(uc => uc.role === 'tutor')
        .map(uc => uc.course_id);

      // Catalog should always come from all synced courses,
      // not only from followed courses.
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

      const datedCourses = withEffectiveCourseDates(allCourses);
      const followedCourseIds = new Set(tutorCourseIds);

      // Get user's ignored courses
      const { data: ignoredCourses } = await supabase
        .from('user_ignored_courses')
        .select('course_id')
        .eq('user_id', user.id);

      const ignoredCourseIds = new Set(ignoredCourses?.map(ic => ic.course_id) || []);

      const { data: attendanceCourses, error: attendanceError } = await (supabase as SupabaseClient)
        .from('attendance_course_settings')
        .select('course_id')
        .eq('user_id', user.id);

      if (attendanceError) throw attendanceError;

      const attendanceCourseIds = new Set(attendanceCourses?.map(ac => ac.course_id) || []);

      // Get stats for each course
      const coursesWithStats: CourseWithStats[] = await Promise.all(
        datedCourses.map(async (course) => {
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
            sc => {
              const row = sc as StudentCourseRiskRow;
              return row.students && ['risco', 'critico'].includes(row.students.current_risk_level);
            }
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
            is_attendance_enabled: attendanceCourseIds.has(course.id),
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
        // RLS-safe role switch.
        await setCourseAssociationRole(courseId, 'viewer');
      } else {
        await setCourseAssociationRole(courseId, 'tutor');
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
  }, [courses, setCourseAssociationRole, user]);

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
      await setCoursesAssociationRole(courseIds, 'viewer');

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
  }, [setCoursesAssociationRole, user]);

  const toggleAttendance = useCallback(async (courseId: string) => {
    if (!user) return;

    const course = courses.find(c => c.id === courseId);
    if (!course) return;

    const shouldEnable = !course.is_attendance_enabled;

    try {
      if (shouldEnable) {
        const { error } = await (supabase as SupabaseClient)
          .from('attendance_course_settings')
          .insert({
            user_id: user.id,
            course_id: courseId,
          });

        if (error) throw error;
      } else {
        const { error } = await (supabase as SupabaseClient)
          .from('attendance_course_settings')
          .delete()
          .eq('user_id', user.id)
          .eq('course_id', courseId);

        if (error) throw error;
      }

      setCourses(prev => prev.map(c =>
        c.id === courseId
          ? { ...c, is_attendance_enabled: shouldEnable }
          : c
      ));
    } catch (err) {
      console.error('Error toggling attendance:', err);
      throw err;
    }
  }, [courses, user]);

  const toggleAttendanceMultiple = useCallback(async (courseIds: string[], shouldEnable: boolean) => {
    if (!user || courseIds.length === 0) return;

    try {
      if (shouldEnable) {
        const enabledCourseIds = new Set(
          courses
            .filter(c => courseIds.includes(c.id) && c.is_attendance_enabled)
            .map(c => c.id)
        );

        const toInsert = courseIds
          .filter(courseId => !enabledCourseIds.has(courseId))
          .map(course_id => ({
            user_id: user.id,
            course_id,
          }));

        if (toInsert.length > 0) {
          const { error } = await (supabase as SupabaseClient)
            .from('attendance_course_settings')
            .insert(toInsert);

          if (error) throw error;
        }
      } else {
        const { error } = await (supabase as SupabaseClient)
          .from('attendance_course_settings')
          .delete()
          .eq('user_id', user.id)
          .in('course_id', courseIds);

        if (error) throw error;
      }

      setCourses(prev => prev.map(c =>
        courseIds.includes(c.id)
          ? { ...c, is_attendance_enabled: shouldEnable }
          : c
      ));
    } catch (err) {
      console.error('Error toggling attendance multiple:', err);
      throw err;
    }
  }, [courses, user]);

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
    unfollowMultiple,
    toggleAttendance,
    toggleAttendanceMultiple,
  };
}
