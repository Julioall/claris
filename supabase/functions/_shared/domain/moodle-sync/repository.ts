import type {
  AppSupabaseClient,
  Tables,
  TablesInsert,
} from '../../db/mod.ts'

export type CourseSyncRecord = Pick<
  Tables<'courses'>,
  'id' | 'moodle_course_id' | 'moodle_site_id' | 'start_date'
>
export type ExistingCourseCategoryRecord = Pick<Tables<'courses'>, 'moodle_course_id' | 'category'>
export type CourseInsert = TablesInsert<'courses'>
export type StudentInsert = TablesInsert<'students'>
export type StudentCourseInsert = TablesInsert<'student_courses'>
export type StudentActivityInsert = TablesInsert<'student_activities'>
export type StudentCourseGradeInsert = TablesInsert<'student_course_grades'>
export type UserCourseInsert = TablesInsert<'user_courses'>
export type StudentSyncSnapshotInsert = TablesInsert<'student_sync_snapshots'>

export async function findCourseByMoodleCourseId(
  supabase: AppSupabaseClient,
  moodleSiteId: string,
  moodleCourseId: string,
): Promise<CourseSyncRecord | null> {
  const { data, error } = await supabase
    .from('courses')
    .select('id, moodle_course_id, moodle_site_id, start_date')
    .eq('moodle_site_id', moodleSiteId)
    .eq('moodle_course_id', moodleCourseId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function findCourseById(
  supabase: AppSupabaseClient,
  courseId: string,
): Promise<CourseSyncRecord | null> {
  const { data, error } = await supabase
    .from('courses')
    .select('id, moodle_course_id, moodle_site_id, start_date')
    .eq('id', courseId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function upsertCourses(
  supabase: AppSupabaseClient,
  payload: CourseInsert[],
): Promise<Tables<'courses'>[]> {
  if (payload.length === 0) return []
  const siteIds = new Set(payload.map((course) => course.moodle_site_id))
  if (siteIds.size !== 1) throw new Error('Course upsert batch must belong to one Moodle site')
  const moodleSiteId = payload[0].moodle_site_id
  const moodleCourseIds = payload.map((course) => course.moodle_course_id)

  const { data: existing, error: existingError } = await supabase
    .from('courses')
    .select('moodle_course_id, content_hash')
    .eq('moodle_site_id', moodleSiteId)
    .in('moodle_course_id', moodleCourseIds)
  if (existingError) throw existingError

  const existingHashes = new Map(
    (existing ?? []).map((course) => [course.moodle_course_id, course.content_hash]),
  )
  const changed = payload.filter((course) => (
    !existingHashes.has(course.moodle_course_id)
    || existingHashes.get(course.moodle_course_id) !== (course.content_hash ?? null)
  ))

  if (changed.length > 0) {
    const { error } = await supabase
      .from('courses')
      .upsert(changed, { onConflict: 'moodle_site_id,moodle_course_id', ignoreDuplicates: false })
    if (error) throw error
  }

  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('moodle_site_id', moodleSiteId)
    .in('moodle_course_id', moodleCourseIds)

  if (error) throw error
  return data ?? []
}

function affectedRowCount(value: unknown, operation: string): number {
  const count = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim().length > 0
    ? Number(value)
    : Number.NaN

  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Invalid affected row count returned by ${operation}`)
  }
  return count
}

export async function replaceUserCourseEligibility(
  supabase: AppSupabaseClient,
  userId: string,
  connectionId: string,
  courseIds: string[],
): Promise<number> {
  const { data, error } = await supabase.rpc('backend_replace_user_course_eligibility', {
    p_course_ids: courseIds,
    p_moodle_connection_id: connectionId,
    p_user_id: userId,
  })

  if (error) throw error
  return affectedRowCount(data, 'course eligibility replacement')
}

export async function linkEligibleUserCourses(
  supabase: AppSupabaseClient,
  userId: string,
  connectionId: string,
  courseIds: string[],
): Promise<number> {
  const { data, error } = await supabase.rpc('backend_link_eligible_user_courses', {
    p_course_ids: courseIds,
    p_moodle_connection_id: connectionId,
    p_user_id: userId,
  })

  if (error) throw error
  return affectedRowCount(data, 'eligible course linking')
}

export async function listCourseCategoriesByMoodleCourseIds(
  supabase: AppSupabaseClient,
  moodleSiteId: string,
  moodleCourseIds: string[],
): Promise<ExistingCourseCategoryRecord[]> {
  if (moodleCourseIds.length === 0) return []

  const { data, error } = await supabase
    .from('courses')
    .select('moodle_course_id, category')
    .eq('moodle_site_id', moodleSiteId)
    .in('moodle_course_id', moodleCourseIds)

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
  if (payload.length === 0) return []
  const siteIds = new Set(payload.map((student) => student.moodle_site_id))
  if (siteIds.size !== 1) throw new Error('Student upsert batch must belong to one Moodle site')
  const moodleSiteId = payload[0].moodle_site_id
  const moodleUserIds = payload.map((student) => student.moodle_user_id)

  const { data: existing, error: existingError } = await supabase
    .from('students')
    .select('moodle_user_id, content_hash')
    .eq('moodle_site_id', moodleSiteId)
    .in('moodle_user_id', moodleUserIds)
  if (existingError) throw existingError

  const existingHashes = new Map(
    (existing ?? []).map((student) => [student.moodle_user_id, student.content_hash]),
  )
  const changed = payload.filter((student) => (
    !existingHashes.has(student.moodle_user_id)
    || existingHashes.get(student.moodle_user_id) !== (student.content_hash ?? null)
  ))

  if (changed.length > 0) {
    const { error } = await supabase
      .from('students')
      .upsert(changed, { onConflict: 'moodle_site_id,moodle_user_id', ignoreDuplicates: false })
    if (error) throw error
  }

  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('moodle_site_id', moodleSiteId)
    .in('moodle_user_id', moodleUserIds)

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

export async function removeStudentCourseLinks(
  supabase: AppSupabaseClient,
  courseId: string,
  studentIds: string[],
): Promise<void> {
  if (studentIds.length === 0) return

  const { error } = await supabase
    .from('student_courses')
    .delete()
    .eq('course_id', courseId)
    .in('student_id', studentIds)

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

export async function listRecentlySyncedGradeStudentIds(
  supabase: AppSupabaseClient,
  courseId: string,
  sinceIso: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('student_course_grades')
    .select('student_id')
    .eq('course_id', courseId)
    .gte('last_sync', sinceIso)

  if (error) throw error

  return new Set((data ?? []).map((row) => row.student_id))
}

export async function listRecentlySyncedActivityStudentIds(
  supabase: AppSupabaseClient,
  courseId: string,
  sinceIso: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('student_activities')
    .select('student_id')
    .eq('course_id', courseId)
    .gte('updated_at', sinceIso)

  if (error) throw error

  return new Set((data ?? []).map((row) => row.student_id))
}

export async function listExistingStudentActivityStatuses(
  supabase: AppSupabaseClient,
  courseId: string,
  studentIds: string[],
): Promise<Array<Pick<Tables<'student_activities'>, 'student_id' | 'moodle_activity_id' | 'status' | 'completed_at'>>> {
  if (studentIds.length === 0) return []

  const { data, error } = await supabase
    .from('student_activities')
    .select('student_id, moodle_activity_id, status, completed_at')
    .eq('course_id', courseId)
    .in('student_id', studentIds)

  if (error) throw error
  return data ?? []
}

/**
 * Inserts sync snapshots for each student in the given course.
 * Uses ON CONFLICT DO NOTHING so that at most one snapshot is kept per
 * student+course per calendar day (enforced by the unique index).
 */
export async function insertStudentSyncSnapshots(
  supabase: AppSupabaseClient,
  payload: StudentSyncSnapshotInsert[],
): Promise<void> {
  if (payload.length === 0) return

  const BATCH = 200
  for (let i = 0; i < payload.length; i += BATCH) {
    const batch = payload.slice(i, i + BATCH)
    const { error } = await supabase
      .from('student_sync_snapshots')
      .upsert(batch, { onConflict: 'student_id,course_id,sync_date', ignoreDuplicates: true })

    if (error) {
      console.error('[insertStudentSyncSnapshots] error:', error)
      // Non-fatal: snapshots are supplementary data, don't abort the main sync.
    }
  }
}
