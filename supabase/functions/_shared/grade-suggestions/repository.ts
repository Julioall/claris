import type { AppSupabaseClient, Tables, TablesInsert, TablesUpdate } from '../db/mod.ts'

type CourseAccessRow = Pick<Tables<'courses'>, 'id' | 'moodle_course_id' | 'name'>
type StudentInCourseRow = Pick<Tables<'students'>, 'id' | 'moodle_user_id' | 'full_name'>
type StudentActivityRow = Pick<
  Tables<'student_activities'>,
  'id' | 'activity_name' | 'activity_type' | 'grade_max' | 'moodle_activity_id' | 'course_id' | 'student_id'
>
type AuditRow = Tables<'ai_grade_suggestion_history'>

export async function findCourseForUser(
  supabase: AppSupabaseClient,
  userId: string,
  courseId: string,
): Promise<CourseAccessRow | null> {
  const { data, error } = await supabase
    .from('user_courses')
    .select('courses!inner(id, moodle_course_id, name)')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle()

  if (error) throw error

  const row = data as { courses?: CourseAccessRow | null } | null
  return row?.courses ?? null
}

export async function findStudentForCourse(
  supabase: AppSupabaseClient,
  studentId: string,
  courseId: string,
): Promise<StudentInCourseRow | null> {
  const { data, error } = await supabase
    .from('student_courses')
    .select('students!inner(id, moodle_user_id, full_name)')
    .eq('student_id', studentId)
    .eq('course_id', courseId)
    .maybeSingle()

  if (error) throw error

  const row = data as { students?: StudentInCourseRow | null } | null
  return row?.students ?? null
}

export async function findStudentActivityForSuggestion(
  supabase: AppSupabaseClient,
  studentId: string,
  courseId: string,
  moodleActivityId: string,
): Promise<StudentActivityRow | null> {
  const { data, error } = await supabase
    .from('student_activities')
    .select('id, activity_name, activity_type, grade_max, moodle_activity_id, course_id, student_id')
    .eq('student_id', studentId)
    .eq('course_id', courseId)
    .eq('moodle_activity_id', moodleActivityId)
    .maybeSingle()

  if (error) throw error
  return data
}

function truncateAuditText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function sanitizeAuditJson(value: unknown, maxTextLength: number): unknown {
  if (typeof value === 'string') {
    return truncateAuditText(value, maxTextLength)
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeAuditJson(item, maxTextLength))
  }

  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {}
    for (const [key, nestedValue] of Object.entries(value)) {
      sanitized[key] = sanitizeAuditJson(nestedValue, maxTextLength)
    }
    return sanitized
  }

  return value
}

export async function insertGradeSuggestionAuditDraft(
  supabase: AppSupabaseClient,
  input: TablesInsert<'ai_grade_suggestion_history'>,
): Promise<string> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_history')
    .insert(input)
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export async function updateGradeSuggestionAudit(
  supabase: AppSupabaseClient,
  auditId: string,
  input: TablesUpdate<'ai_grade_suggestion_history'>,
  maxTextLength: number,
): Promise<void> {
  const sanitizedInput = sanitizeAuditJson(input, maxTextLength) as TablesUpdate<'ai_grade_suggestion_history'>

  const { error } = await supabase
    .from('ai_grade_suggestion_history')
    .update(sanitizedInput)
    .eq('id', auditId)

  if (error) throw error
}

export async function loadGradeSuggestionAuditForUser(
  supabase: AppSupabaseClient,
  auditId: string,
  userId: string,
): Promise<AuditRow | null> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_history')
    .select('*')
    .eq('id', auditId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function markStudentActivityApproved(
  supabase: AppSupabaseClient,
  params: {
    studentActivityId: string
    approvedGrade: number
    maxGrade: number | null
    approvedAt: string
  },
): Promise<void> {
  const percentage = params.maxGrade && params.maxGrade > 0
    ? Number(((params.approvedGrade / params.maxGrade) * 100).toFixed(2))
    : null

  const { error } = await supabase
    .from('student_activities')
    .update({
      grade: params.approvedGrade,
      percentage,
      status: 'graded',
      graded_at: params.approvedAt,
      updated_at: params.approvedAt,
    })
    .eq('id', params.studentActivityId)

  if (error) throw error
}

