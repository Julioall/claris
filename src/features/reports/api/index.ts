// API para ReportsPage e read models acadêmicos

import { supabase } from '@/integrations/supabase/client';

// Busca cursos do tutor a partir de user_courses (com join em courses)
export async function fetchTutorCourses(userId: string) {
  return supabase
    .from('user_courses')
    .select(`
      course_id,
      courses!inner (
        id,
        name,
        short_name,
        category,
        start_date,
        end_date
      )
    `)
    .eq('user_id', userId)
    .eq('role', 'tutor');
}

// Busca paginada de matrículas de alunos em cursos
export async function fetchStudentCourses(courseIds: string[], page: number, pageSize: number) {
  return supabase
    .from('student_courses')
    .select(`
      student_id,
      course_id,
      enrollment_status,
      students!inner(full_name, last_access)
    `)
    .in('course_id', courseIds)
    .range(page * pageSize, (page + 1) * pageSize - 1);
}

// Busca paginada de atividades de alunos
export async function fetchStudentActivities(courseIds: string[], page: number, pageSize: number) {
  return supabase
    .from('student_activities')
    .select(`
      student_id,
      course_id,
      grade,
      grade_max,
      hidden,
      status,
      graded_at,
      submitted_at
    `)
    .in('course_id', courseIds)
    .range(page * pageSize, (page + 1) * pageSize - 1);
}
