import { userHasPermission as checkPermission } from '../_shared/auth/mod.ts'
import {
  createServiceClient,
  type AppSupabaseClient,
} from '../_shared/db/mod.ts'
import {
  chunkUniqueAcademicReportValues,
  collectAcademicReportPages,
} from './pagination.ts'
import type {
  AcademicReportActivityRecord,
  AcademicReportCourseRecord,
  AcademicReportEnrollmentRecord,
  AcademicReportGradeRecord,
} from './rules.ts'

export interface AcademicReportsRepository {
  hasTutorCourseScope(userId: string, courseIds: string[]): Promise<boolean>
  listActivities(courseIds: string[]): Promise<AcademicReportActivityRecord[]>
  listCourseGrades(courseIds: string[]): Promise<AcademicReportGradeRecord[]>
  listCourses(courseIds: string[]): Promise<AcademicReportCourseRecord[]>
  listEnrollments(courseIds: string[]): Promise<AcademicReportEnrollmentRecord[]>
  listTutorCourses(userId: string): Promise<AcademicReportCourseRecord[]>
  userHasPermission(userId: string, permission: string): Promise<boolean>
}

interface EnrollmentQueryRow {
  course_id: string
  enrollment_status: string | null
  id: string
  student_id: string
  students: {
    full_name: string
    id: string
    last_access: string | null
  } | null
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numberValue)) throw new Error(`Invalid ${field} returned by database`)
  return numberValue
}

async function collectBatchedPages<T>(
  courseIds: string[],
  fetchPage: (batch: string[], from: number, to: number) => Promise<{
    data: T[] | null
    error: unknown | null
  }>,
): Promise<T[]> {
  const rows: T[] = []
  for (const batch of chunkUniqueAcademicReportValues(courseIds)) {
    rows.push(...await collectAcademicReportPages(({ from, to }) => fetchPage(batch, from, to)))
  }
  return rows
}

export function createAcademicReportsRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): AcademicReportsRepository {
  async function listTutorCourseIds(userId: string): Promise<string[]> {
    const rows = await collectAcademicReportPages<{ course_id: string }>(async ({ from, to }) => {
      const { data, error } = await supabase
        .from('user_courses')
        .select('course_id')
        .eq('user_id', userId)
        .eq('role', 'tutor')
        .order('course_id')
        .range(from, to)
      return { data, error }
    })
    return rows.map((row) => row.course_id)
  }

  async function listCourses(courseIds: string[]): Promise<AcademicReportCourseRecord[]> {
    const rows = []
    for (const batch of chunkUniqueAcademicReportValues(courseIds)) {
      const { data, error } = await supabase
        .from('courses')
        .select('id, name, short_name, category, start_date, end_date')
        .in('id', batch)
        .order('id')
      if (error) throw error
      rows.push(...(data ?? []))
    }

    return rows.map((course) => ({
      category: course.category,
      endAt: course.end_date,
      id: course.id,
      name: course.name,
      shortName: course.short_name,
      startAt: course.start_date,
    }))
  }

  return {
    async userHasPermission(userId, permission) {
      return checkPermission(supabase, userId, permission)
    },

    async hasTutorCourseScope(userId, courseIds) {
      const scopedIds = new Set<string>()
      for (const batch of chunkUniqueAcademicReportValues(courseIds)) {
        const { data, error } = await supabase
          .from('user_courses')
          .select('course_id')
          .eq('user_id', userId)
          .eq('role', 'tutor')
          .in('course_id', batch)
          .order('course_id')
        if (error) throw error
        data?.forEach((row) => scopedIds.add(row.course_id))
      }
      return courseIds.every((courseId) => scopedIds.has(courseId))
    },

    async listTutorCourses(userId) {
      return listCourses(await listTutorCourseIds(userId))
    },

    listCourses,

    async listEnrollments(courseIds) {
      const rows = await collectBatchedPages<EnrollmentQueryRow>(
        courseIds,
        async (batch, from, to) => {
          const { data, error } = await supabase
            .from('student_courses')
            .select('id, student_id, course_id, enrollment_status, students!inner(id, full_name, last_access)')
            .in('course_id', batch)
            .order('course_id')
            .order('student_id')
            .order('id')
            .range(from, to)
          return { data: data as unknown as EnrollmentQueryRow[] | null, error }
        },
      )

      return rows.flatMap((row) => row.students
        ? [{
          courseId: row.course_id,
          enrollmentStatus: row.enrollment_status,
          lastAccessAt: row.students.last_access,
          studentId: row.student_id,
          studentName: row.students.full_name,
        }]
        : [])
    },

    async listCourseGrades(courseIds) {
      const rows = await collectBatchedPages<{
        course_id: string
        grade_percentage: number | null
        grade_raw: number | null
        id: string
        student_id: string
      }>(courseIds, async (batch, from, to) => {
        const { data, error } = await supabase
          .from('student_course_grades')
          .select('id, student_id, course_id, grade_raw, grade_percentage')
          .in('course_id', batch)
          .order('course_id')
          .order('student_id')
          .order('id')
          .range(from, to)
        return { data, error }
      })

      return rows.map((row) => ({
        courseId: row.course_id,
        gradePercentage: nullableNumber(row.grade_percentage, 'grade_percentage'),
        gradeRaw: nullableNumber(row.grade_raw, 'grade_raw'),
        id: row.id,
        studentId: row.student_id,
      }))
    },

    async listActivities(courseIds) {
      const rows = await collectBatchedPages<{
        activity_name: string
        activity_type: string | null
        completed_at: string | null
        course_id: string
        grade: number | null
        grade_max: number | null
        graded_at: string | null
        hidden: boolean
        id: string
        moodle_activity_id: string
        status: string | null
        student_id: string
        submitted_at: string | null
      }>(courseIds, async (batch, from, to) => {
        const { data, error } = await supabase
          .from('student_activities')
          .select('id, student_id, course_id, moodle_activity_id, activity_name, activity_type, status, grade, grade_max, hidden, completed_at, graded_at, submitted_at')
          .in('course_id', batch)
          .neq('activity_type', 'scorm')
          .order('course_id')
          .order('student_id')
          .order('moodle_activity_id')
          .order('id')
          .range(from, to)
        return { data, error }
      })

      return rows.flatMap((row) => typeof row.activity_type === 'string'
        ? [{
          activityName: row.activity_name,
          activityType: row.activity_type,
          completedAt: row.completed_at,
          courseId: row.course_id,
          grade: nullableNumber(row.grade, 'grade'),
          gradeMax: nullableNumber(row.grade_max, 'grade_max'),
          gradedAt: row.graded_at,
          hidden: row.hidden,
          id: row.id,
          moodleActivityId: row.moodle_activity_id,
          status: row.status,
          studentId: row.student_id,
          submittedAt: row.submitted_at,
        }]
        : [])
    },
  }
}
