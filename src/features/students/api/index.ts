// API para StudentGradesTab e dados de alunos

import { supabase } from '@/integrations/supabase/client';

export async function fetchStudentGrades(studentId: string) {
  return supabase
    .from('student_course_grades')
    .select('*, courses(name)')
    .eq('student_id', studentId);
}

export async function fetchStudentActivities(studentId: string) {
  return supabase
    .from('student_activities')
    .select('*, courses(name)')
    .eq('student_id', studentId);
}
