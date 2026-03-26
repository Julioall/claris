import { supabase } from '@/integrations/supabase/client';

export type AttendanceStatus = 'presente' | 'ausente' | 'justificado';

export interface AttendanceRecordUpsert {
  user_id: string;
  course_id: string;
  student_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  notes: string | null;
}

export async function fetchAttendanceRecords(userId: string, courseId: string) {
  return supabase
    .from('attendance_records')
    .select('id, attendance_date, status, notes, students (id, full_name)')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .order('attendance_date', { ascending: false });
}

export async function fetchAttendanceRecordsForDate(userId: string, courseId: string, date: string) {
  return supabase
    .from('attendance_records')
    .select('student_id, status, notes, updated_at')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('attendance_date', date)
    .order('updated_at', { ascending: false });
}

export async function saveAttendanceRecords(payload: AttendanceRecordUpsert[]) {
  return supabase
    .from('attendance_records')
    .upsert(payload, { onConflict: 'user_id,course_id,student_id,attendance_date' });
}

export async function fetchStudentCourses(courseId: string) {
  return supabase
    .from('student_courses')
    .select('students (id, full_name, email)')
    .eq('course_id', courseId);
}

export * from './sync';
