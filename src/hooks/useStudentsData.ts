import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Student, RiskLevel } from '@/types';

interface StudentWithStats extends Student {
  pending_tasks_count: number;
  last_action_date?: string;
  enrollment_status?: string;
}

export function useStudentsData(courseId?: string) {
  const { user } = useAuth();
  const [students, setStudents] = useState<StudentWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStudents = useCallback(async () => {
    if (!user) {
      setStudents([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get user's courses where they are a tutor
      const { data: userCourses, error: userCoursesError } = await supabase
        .from('user_courses')
        .select('course_id')
        .eq('user_id', user.id)
        .eq('role', 'tutor');

      if (userCoursesError) throw userCoursesError;

      if (!userCourses || userCourses.length === 0) {
        setStudents([]);
        setIsLoading(false);
        return;
      }

      const courseIds = courseId 
        ? [courseId] 
        : userCourses.map(uc => uc.course_id);

      // Get students in these courses
      const { data: studentCourses, error: studentCoursesError } = await supabase
        .from('student_courses')
        .select(`
          student_id,
          enrollment_status,
          students (*)
        `)
        .in('course_id', courseIds);

      if (studentCoursesError) throw studentCoursesError;

      if (!studentCourses || studentCourses.length === 0) {
        setStudents([]);
        setIsLoading(false);
        return;
      }

      // Deduplicate students (same student can be in multiple courses)
      // For enrollment status: if student is active in ANY course, show as active
      // Only show as suspended if suspended in ALL courses
      const uniqueStudentsMap = new Map<string, { student: any; statuses: Set<string> }>();
      studentCourses.forEach(sc => {
        if (sc.students) {
          const studentId = (sc.students as any).id;
          if (!uniqueStudentsMap.has(studentId)) {
            uniqueStudentsMap.set(studentId, { 
              student: sc.students, 
              statuses: new Set([sc.enrollment_status || 'ativo'])
            });
          } else {
            uniqueStudentsMap.get(studentId)!.statuses.add(sc.enrollment_status || 'ativo');
          }
        }
      });

      const uniqueStudentEntries = Array.from(uniqueStudentsMap.values()).map(entry => ({
        student: entry.student,
        enrollment_status: entry.statuses.has('ativo') ? 'ativo' : 
                          entry.statuses.has('concluido') ? 'concluido' :
                          entry.statuses.has('inativo') ? 'inativo' : 'suspenso',
      }));

      // Get stats for each student
      const studentsWithStats: StudentWithStats[] = await Promise.all(
        uniqueStudentEntries.map(async ({ student, enrollment_status }) => {
          // Count pending tasks
          const { count: pendingTasksCount, error: pendingTasksError } = await supabase
            .from('pending_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('student_id', student.id)
            .neq('status', 'resolvida');

          if (pendingTasksError) {
            console.warn('Error counting pending tasks for student:', student.id, pendingTasksError);
          }

          // Get last action date
          const { data: lastAction } = await supabase
            .from('actions')
            .select('completed_at, created_at')
            .eq('student_id', student.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            ...student,
            current_risk_level: student.current_risk_level as RiskLevel,
            pending_tasks_count: pendingTasksCount || 0,
            last_action_date: lastAction?.completed_at || lastAction?.created_at,
            enrollment_status: enrollment_status || 'ativo',
          } as StudentWithStats;
        })
      );

      // Sort by risk level (critical first)
      const riskOrder = { critico: 0, risco: 1, atencao: 2, normal: 3 };
      studentsWithStats.sort((a, b) => 
        riskOrder[a.current_risk_level] - riskOrder[b.current_risk_level]
      );

      setStudents(studentsWithStats);
    } catch (err) {
      console.error('Error fetching students:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar alunos');
    } finally {
      setIsLoading(false);
    }
  }, [user, courseId]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  return { students, isLoading, error, refetch: fetchStudents };
}
