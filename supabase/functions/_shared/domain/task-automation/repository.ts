import type {
  AppSupabaseClient,
  Enums,
  Tables,
  TablesInsert,
} from '../../db/mod.ts'
import {
  isStudentActivityPendingCorrection,
  isStudentActivityPendingSubmission,
  isStudentActivityWeightedInGradebook,
} from '../student-activity-status.ts'

export interface AtRiskStudent {
  currentRiskLevel: Extract<Enums<'risk_level'>, 'critico' | 'risco'>
  fullName: string
  studentId: string
}

export interface ActivityCandidate {
  activityId: string
  activityName: string
  courseId: string
  dueDate: string
  studentId: string
}

export type PendingTaskInsert = TablesInsert<'pending_tasks'>
export type RecurrenceConfig = Tables<'task_recurrence_configs'>

export async function listUserCourseIds(
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

export async function listAtRiskStudents(
  supabase: AppSupabaseClient,
  courseIds: string[],
): Promise<AtRiskStudent[]> {
  const { data, error } = await supabase
    .from('student_courses')
    .select('student_id, students!inner(id, full_name, current_risk_level)')
    .in('course_id', courseIds)
    .in('students.current_risk_level', ['risco', 'critico'])

  if (error) throw error

  const enrollments = (data ?? []) as Array<{
    student_id: string
    students: { full_name: string; current_risk_level: AtRiskStudent['currentRiskLevel'] }
  }>

  return enrollments.map((row) => ({
    currentRiskLevel: row.students.current_risk_level,
    fullName: row.students.full_name,
    studentId: row.student_id,
  }))
}

export async function listMissedAssignments(
  supabase: AppSupabaseClient,
  courseIds: string[],
  referenceIso: string,
): Promise<ActivityCandidate[]> {
  const { data, error } = await supabase
    .from('student_activities')
    .select('id, student_id, course_id, activity_name, due_date, activity_type, grade, grade_max, percentage, status, completed_at, submitted_at, graded_at')
    .in('course_id', courseIds)
    .eq('activity_type', 'assign')
    .not('due_date', 'is', null)
    .lt('due_date', referenceIso)
    .eq('hidden', false)

  if (error) throw error

  return (data ?? [])
    .filter((row) => isStudentActivityWeightedInGradebook(row))
    .filter((row) => isStudentActivityPendingSubmission(row))
    .map((row) => ({
      activityId: row.id,
      activityName: row.activity_name,
      courseId: row.course_id,
      dueDate: row.due_date!,
      studentId: row.student_id,
    }))
}

export async function listUncorrectedAssignments(
  supabase: AppSupabaseClient,
  courseIds: string[],
  referenceIso: string,
): Promise<ActivityCandidate[]> {
  const { data, error } = await supabase
    .from('student_activities')
    .select('id, student_id, course_id, activity_name, due_date, activity_type, grade, grade_max, percentage, status, completed_at, submitted_at, graded_at')
    .in('course_id', courseIds)
    .eq('activity_type', 'assign')
    .not('due_date', 'is', null)
    .lt('due_date', referenceIso)
    .eq('hidden', false)

  if (error) throw error

  return (data ?? [])
    .filter((row) => isStudentActivityWeightedInGradebook(row))
    .filter((row) => isStudentActivityPendingCorrection(row))
    .map((row) => ({
      activityId: row.id,
      activityName: row.activity_name,
      courseId: row.course_id,
      dueDate: row.due_date!,
      studentId: row.student_id,
    }))
}

export async function hasOpenAutomatedTask(
  supabase: AppSupabaseClient,
  params: {
    automationType: Enums<'task_automation_type'>
    courseId?: string | null
    moodleActivityId?: string
    studentId: string
  },
): Promise<boolean> {
  let query = supabase
    .from('pending_tasks')
    .select('id')
    .eq('student_id', params.studentId)
    .eq('automation_type', params.automationType)
    .in('status', ['aberta', 'em_andamento'])

  query = params.courseId === null
    ? query.is('course_id', null)
    : params.courseId
      ? query.eq('course_id', params.courseId)
      : query

  query = params.moodleActivityId
    ? query.eq('moodle_activity_id', params.moodleActivityId)
    : query

  const { data, error } = await query.maybeSingle()

  if (error) throw error
  return Boolean(data)
}

export async function createPendingTask(
  supabase: AppSupabaseClient,
  payload: PendingTaskInsert,
): Promise<void> {
  const { error } = await supabase.from('pending_tasks').insert(payload)

  if (error) throw error
}

export async function listDueRecurrenceConfigs(
  supabase: AppSupabaseClient,
  createdByUserId: string,
  referenceIso: string,
): Promise<RecurrenceConfig[]> {
  const { data, error } = await supabase
    .from('task_recurrence_configs')
    .select('*')
    .eq('created_by_user_id', createdByUserId)
    .eq('is_active', true)
    .lte('start_date', referenceIso)
    .or(`next_generation_at.is.null,next_generation_at.lte.${referenceIso}`)
    .or(`end_date.is.null,end_date.gte.${referenceIso}`)

  if (error) throw error
  return data ?? []
}

export async function updateRecurrenceSchedule(
  supabase: AppSupabaseClient,
  configId: string,
  payload: Pick<TablesInsert<'task_recurrence_configs'>, 'last_generated_at' | 'next_generation_at'>,
): Promise<void> {
  const { error } = await supabase
    .from('task_recurrence_configs')
    .update(payload)
    .eq('id', configId)

  if (error) throw error
}
