import { supabase } from '@/integrations/supabase/client';

export interface GradeDebugCourseOption {
  id: string;
  name: string;
  moodle_course_id: string;
}

export interface GradeDebugStudentOption {
  id: string;
  full_name: string;
  moodle_user_id: string;
}

export async function syncGradesDebug() {
  return supabase.functions.invoke('moodle-sync-grades', { body: {} });
}

export async function listGradeDebugCourses() {
  return supabase
    .from('courses')
    .select('id, name, moodle_course_id')
    .order('name');
}

export async function listGradeDebugStudentsByMoodleCourseId(moodleCourseId: string) {
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id')
    .eq('moodle_course_id', moodleCourseId)
    .single();

  if (courseError) {
    return { data: null, error: courseError };
  }

  if (!course) {
    return { data: [] as GradeDebugStudentOption[], error: null };
  }

  const { data, error } = await supabase
    .from('student_courses')
    .select('students!inner(id, full_name, moodle_user_id)')
    .eq('course_id', course.id)
    .limit(20);

  if (error) {
    return { data: null, error };
  }

  const students = (data ?? []).map((row) => {
    const student = row.students as GradeDebugStudentOption;
    return {
      id: student.id,
      full_name: student.full_name,
      moodle_user_id: student.moodle_user_id,
    };
  });

  return { data: students, error: null };
}

export async function debugStudentGrades(params: {
  moodleUrl: string;
  token: string;
  courseId: number;
  userId: number;
}) {
  return supabase.functions.invoke('moodle-sync-grades', {
    body: {
      action: 'debug_grades',
      moodleUrl: params.moodleUrl,
      token: params.token,
      courseId: params.courseId,
      userId: params.userId,
    },
  });
}
