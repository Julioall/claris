import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Student, RiskLevel } from '@/types';

interface StudentWithStats extends Student {
  pending_tasks_count: number;
  enrollment_status?: string;
}

type StudentCourseStudent = Student;

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
          courses (start_date),
          students (*)
        `)
        .in('course_id', courseIds);

      if (studentCoursesError) throw studentCoursesError;

      if (!studentCourses || studentCourses.length === 0) {
        setStudents([]);
        setIsLoading(false);
        return;
      }

      const now = new Date();

      // Deduplicate students (same student can be in multiple courses)
      // Status final por precedência em UCs válidas: suspenso > concluido > ativo > inativo
      const uniqueStudentsMap = new Map<string, { student: StudentCourseStudent; validStatuses: Set<string>; allStatuses: Set<string> }>();
      studentCourses.forEach(sc => {
        const relatedStudent = sc.students as StudentCourseStudent | null;

        if (relatedStudent) {
          const studentId = relatedStudent.id;
          const startDate = (sc.courses as { start_date?: string | null } | null)?.start_date;
          const isValidCourse = !startDate || new Date(startDate) <= now;
          const status = (sc.enrollment_status || 'ativo').toLowerCase();

          if (!uniqueStudentsMap.has(studentId)) {
            uniqueStudentsMap.set(studentId, { 
              student: relatedStudent,
              validStatuses: isValidCourse ? new Set([status]) : new Set<string>(),
              allStatuses: new Set([status]),
            });
          } else {
            uniqueStudentsMap.get(studentId)!.allStatuses.add(status);
            if (isValidCourse) {
              uniqueStudentsMap.get(studentId)!.validStatuses.add(status);
            }
          }
        }
      });

      const uniqueStudentEntries = Array.from(uniqueStudentsMap.values()).map(entry => ({
        student: entry.student,
        enrollment_status:
          entry.validStatuses.size > 0
            ? entry.validStatuses.has('suspenso')
              ? 'suspenso'
              : entry.validStatuses.has('concluido')
                ? 'concluido'
                : entry.validStatuses.has('ativo')
                  ? 'ativo'
                  : 'inativo'
            : entry.allStatuses.has('concluido')
              ? 'concluido'
              : entry.allStatuses.has('ativo')
                ? 'ativo'
                : entry.allStatuses.has('suspenso')
                  ? 'suspenso'
                  : 'inativo',
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

          return {
            ...student,
            current_risk_level: student.current_risk_level as RiskLevel,
            pending_tasks_count: pendingTasksCount || 0,
            enrollment_status: enrollment_status || 'ativo',
          } as StudentWithStats;
        })
      );

      // Sort by risk level (critical first)
      const riskOrder: Record<RiskLevel, number> = { critico: 0, risco: 1, atencao: 2, normal: 3, inativo: 4 };
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
