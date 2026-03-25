// API para CourseAttendanceTab e dados de cursos

import { supabase } from '@/integrations/supabase/client';

export async function fetchAttendanceRecords(userId: string, courseId: string) {
  return supabase.from('attendance_records').select('*').eq('user_id', userId).eq('course_id', courseId);
}

export async function fetchStudentCourses(courseId: string) {
  return supabase.from('student_courses').select('students (id, full_name, email)').eq('course_id', courseId);
}
