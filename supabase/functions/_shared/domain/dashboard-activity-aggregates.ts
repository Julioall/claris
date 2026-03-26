import type {
  AppSupabaseClient,
  Tables,
  TablesInsert,
} from '../db/mod.ts'
import {
  isStudentActivityPendingCorrection,
  isStudentActivityPendingSubmission,
  isStudentActivityWeightedInGradebook,
} from './student-activity-status.ts'

type StudentCourseAggregateRow = Pick<
  Tables<'student_courses'>,
  'course_id' | 'enrollment_status' | 'student_id'
>

type StudentActivityAggregateRow = Pick<
  Tables<'student_activities'>,
  | 'activity_type'
  | 'completed_at'
  | 'course_id'
  | 'due_date'
  | 'grade'
  | 'grade_max'
  | 'graded_at'
  | 'hidden'
  | 'percentage'
  | 'status'
  | 'student_id'
  | 'submitted_at'
>

type DashboardCourseActivityAggregateInsert = TablesInsert<'dashboard_course_activity_aggregates'>

const PAGE_SIZE = 1000

function normalizeEnrollmentStatus(status: string | null | undefined) {
  return (status || '').trim().toLowerCase()
}

async function paginateRows<T>(
  fetchPage: (page: number) => Promise<{ data: T[] | null; error: Error | null }>,
) {
  const rows: T[] = []
  let page = 0

  while (true) {
    const { data, error } = await fetchPage(page)

    if (error) {
      throw error
    }

    rows.push(...(data ?? []))

    if (!data || data.length < PAGE_SIZE) {
      break
    }

    page += 1
  }

  return rows
}

export async function refreshDashboardCourseActivityAggregates(
  supabase: AppSupabaseClient,
  courseIds: string[],
): Promise<void> {
  const uniqueCourseIds = [...new Set(courseIds.filter(Boolean))]

  if (uniqueCourseIds.length === 0) return

  const [studentCourses, studentActivities] = await Promise.all([
    paginateRows<StudentCourseAggregateRow>(async (page) => {
      const { data, error } = await supabase
        .from('student_courses')
        .select('course_id, student_id, enrollment_status')
        .in('course_id', uniqueCourseIds)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      return { data: (data ?? []) as StudentCourseAggregateRow[], error }
    }),
    paginateRows<StudentActivityAggregateRow>(async (page) => {
      const { data, error } = await supabase
        .from('student_activities')
        .select(`
          course_id,
          student_id,
          activity_type,
          grade,
          grade_max,
          percentage,
          status,
          completed_at,
          submitted_at,
          graded_at,
          due_date,
          hidden
        `)
        .in('course_id', uniqueCourseIds)
        .in('activity_type', ['assign', 'assignment'])
        .eq('hidden', false)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      return { data: (data ?? []) as StudentActivityAggregateRow[], error }
    }),
  ])

  const activeStudentIdsByCourse = new Map<string, Set<string>>()

  uniqueCourseIds.forEach((courseId) => {
    activeStudentIdsByCourse.set(courseId, new Set())
  })

  studentCourses.forEach((studentCourse) => {
    if (normalizeEnrollmentStatus(studentCourse.enrollment_status) === 'suspenso') {
      return
    }

    const courseStudentIds = activeStudentIdsByCourse.get(studentCourse.course_id)
    if (!courseStudentIds) return
    courseStudentIds.add(studentCourse.student_id)
  })

  const now = Date.now()
  const payloadByCourse = new Map<string, DashboardCourseActivityAggregateInsert>()

  uniqueCourseIds.forEach((courseId) => {
    payloadByCourse.set(courseId, {
      course_id: courseId,
      pending_submission_assignments: 0,
      pending_correction_assignments: 0,
      updated_at: new Date(now).toISOString(),
    })
  })

  studentActivities.forEach((activity) => {
    const courseStudentIds = activeStudentIdsByCourse.get(activity.course_id)
    if (!courseStudentIds?.has(activity.student_id)) return
    if (!isStudentActivityWeightedInGradebook(activity)) return

    const aggregateRow = payloadByCourse.get(activity.course_id)
    if (!aggregateRow) return

    if (isStudentActivityPendingCorrection(activity)) {
      aggregateRow.pending_correction_assignments = (aggregateRow.pending_correction_assignments ?? 0) + 1
      return
    }

    if (!isStudentActivityPendingSubmission(activity)) {
      return
    }

    if (!activity.due_date) {
      return
    }

    const dueDateMs = new Date(activity.due_date).getTime()
    if (Number.isNaN(dueDateMs) || dueDateMs >= now) {
      return
    }

    aggregateRow.pending_submission_assignments = (aggregateRow.pending_submission_assignments ?? 0) + 1
  })

  const payload = Array.from(payloadByCourse.values())

  if (payload.length === 0) return

  const { error } = await supabase
    .from('dashboard_course_activity_aggregates')
    .upsert(payload, { onConflict: 'course_id', ignoreDuplicates: false })

  if (error) throw error
}
