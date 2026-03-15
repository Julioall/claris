import type {
  AppSupabaseClient,
  Tables,
  TablesInsert,
} from '../../db/mod.ts'

export type CourseSyncRecord = Pick<Tables<'courses'>, 'id' | 'start_date'>
export type CourseInsert = TablesInsert<'courses'>
export type StudentInsert = TablesInsert<'students'>
export type StudentCourseInsert = TablesInsert<'student_courses'>
export type StudentActivityInsert = TablesInsert<'student_activities'>
export type StudentCourseGradeInsert = TablesInsert<'student_course_grades'>
export type UserCourseInsert = TablesInsert<'user_courses'>

export async function findCourseByMoodleCourseId(
  supabase: AppSupabaseClient,
  moodleCourseId: string,
): Promise<CourseSyncRecord | null> {
  const { data, error } = await supabase
    .from('courses')
    .select('id, start_date')
    .eq('moodle_course_id', moodleCourseId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function upsertCourses(
  supabase: AppSupabaseClient,
  payload: CourseInsert[],
): Promise<Tables<'courses'>[]> {
  const { data, error } = await supabase
    .from('courses')
    .upsert(payload, { onConflict: 'moodle_course_id', ignoreDuplicates: false })
    .select()

  if (error) throw error
  return data ?? []
}

export async function listLinkedCourseIds(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_courses')
    .select('course_id')
    .eq('user_id', userId)

  if (error) throw error
  return (data ?? []).map((row) => row.course_id)
}

export async function removeUserCourseLinks(
  supabase: AppSupabaseClient,
  userId: string,
  courseIds: string[],
): Promise<void> {
  if (courseIds.length === 0) return

  const { error } = await supabase
    .from('user_courses')
    .delete()
    .eq('user_id', userId)
    .in('course_id', courseIds)

  if (error) throw error
}

export async function upsertUserCourseLinks(
  supabase: AppSupabaseClient,
  payload: UserCourseInsert[],
): Promise<void> {
  if (payload.length === 0) return

  const { error } = await supabase
    .from('user_courses')
    .upsert(payload, { onConflict: 'user_id,course_id', ignoreDuplicates: true })

  if (error) throw error
}

export async function listStudentIdsByCourseId(
  supabase: AppSupabaseClient,
  courseId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('student_courses')
    .select('student_id')
    .eq('course_id', courseId)

  if (error) throw error
  return (data ?? []).map((row) => row.student_id)
}

export async function listStudentsWithMoodleUserId(
  supabase: AppSupabaseClient,
  studentIds: string[],
): Promise<Array<Pick<Tables<'students'>, 'id' | 'moodle_user_id'>>> {
  if (studentIds.length === 0) return []

  const { data, error } = await supabase
    .from('students')
    .select('id, moodle_user_id')
    .in('id', studentIds)

  if (error) throw error
  return data ?? []
}

export async function upsertStudentActivities(
  supabase: AppSupabaseClient,
  payload: StudentActivityInsert[],
  batchSize: number,
): Promise<number> {
  let total = 0

  for (let i = 0; i < payload.length; i += batchSize) {
    const batch = payload.slice(i, i + batchSize)
    const { error } = await supabase
      .from('student_activities')
      .upsert(batch, { onConflict: 'student_id,course_id,moodle_activity_id', ignoreDuplicates: false })

    if (error) throw error
    total += batch.length
  }

  return total
}

export async function upsertStudents(
  supabase: AppSupabaseClient,
  payload: StudentInsert[],
): Promise<Tables<'students'>[]> {
  const { data, error } = await supabase
    .from('students')
    .upsert(payload, { onConflict: 'moodle_user_id', ignoreDuplicates: false })
    .select()

  if (error) throw error
  return data ?? []
}

export async function listExistingCourseStudentLinks(
  supabase: AppSupabaseClient,
  courseId: string,
): Promise<Array<{ moodle_user_id: string | null; student_id: string }>> {
  const { data, error } = await supabase
    .from('student_courses')
    .select('student_id, students (moodle_user_id)')
    .eq('course_id', courseId)

  if (error) throw error

  const rows = (data ?? []) as Array<{ student_id: string; students: { moodle_user_id: string | null } | null }>

  return rows.map((row) => ({
    moodle_user_id: row.students?.moodle_user_id ?? null,
    student_id: row.student_id,
  }))
}

export async function upsertStudentCourseLinks(
  supabase: AppSupabaseClient,
  payload: StudentCourseInsert[],
): Promise<void> {
  if (payload.length === 0) return

  const { error } = await supabase
    .from('student_courses')
    .upsert(payload, { onConflict: 'student_id,course_id', ignoreDuplicates: false })

  if (error) throw error
}

export async function touchCourseLastSync(
  supabase: AppSupabaseClient,
  courseId: string,
  timestamp: string,
): Promise<void> {
  const { error } = await supabase
    .from('courses')
    .update({ last_sync: timestamp })
    .eq('id', courseId)

  if (error) throw error
}

export async function listCourseEnrollmentsWithMoodleUserId(
  supabase: AppSupabaseClient,
  courseId: string,
): Promise<Array<{ moodle_user_id: string; student_id: string }>> {
  const { data, error } = await supabase
    .from('student_courses')
    .select('student_id, students!inner(id, moodle_user_id)')
    .eq('course_id', courseId)

  if (error) throw error

  const rows = (data ?? []) as Array<{
    student_id: string
    students: { moodle_user_id: string }
  }>

  return rows.map((row) => ({
    moodle_user_id: row.students.moodle_user_id,
    student_id: row.student_id,
  }))
}

export async function upsertStudentCourseGrades(
  supabase: AppSupabaseClient,
  payload: StudentCourseGradeInsert[],
  batchSize: number,
): Promise<number> {
  let total = 0

  for (let i = 0; i < payload.length; i += batchSize) {
    const batch = payload.slice(i, i + batchSize)
    const { error } = await supabase
      .from('student_course_grades')
      .upsert(batch, { onConflict: 'student_id,course_id', ignoreDuplicates: false })

    if (error) throw error
    total += batch.length
  }

  return total
}
