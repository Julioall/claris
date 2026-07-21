import {
  isApplicationAdmin as checkApplicationAdmin,
  userHasCourseAccess as checkCourseAccess,
  userHasPermission as checkPermission,
} from '../_shared/auth/mod.ts'
import {
  createServiceClient,
  type AppSupabaseClient,
} from '../_shared/db/mod.ts'
import {
  chunkUniqueCoursePanelValues,
  collectCoursePanelPages,
} from './pagination.ts'
import type {
  CoursePanelActivityRuleInput,
  CoursePanelCourseDateRuleInput,
  CoursePanelEnrollmentRuleInput,
  CoursePanelStudentRuleInput,
} from './rules.ts'

export interface CoursePanelCourseRecord extends CoursePanelCourseDateRuleInput {
  lastSyncedAt: string | null
  moodleCourseId: string
  name: string
  shortName: string | null
  updatedAt: string | null
}

export interface CoursePanelStudentRecord extends CoursePanelStudentRuleInput {
  avatarUrl: string | null
  email: string | null
  lastAccessAt: string | null
  name: string
  updatedAt: string | null
}

export interface CoursePanelEnrollmentRecord extends CoursePanelEnrollmentRuleInput {
  lastAccessAt: string | null
  lastSyncedAt: string | null
  student: CoursePanelStudentRecord | null
}

export interface CoursePanelActivityRecord extends CoursePanelActivityRuleInput {
  updatedAt: string | null
}

export interface CoursePanelRepository {
  findCourse(courseId: string): Promise<CoursePanelCourseRecord | null>
  isAttendanceEnabled(userId: string, courseId: string): Promise<boolean>
  listAccessibleCourseDates(userId: string): Promise<CoursePanelCourseDateRuleInput[]>
  listActivities(courseId: string): Promise<CoursePanelActivityRecord[]>
  listEnrollments(courseId: string): Promise<CoursePanelEnrollmentRecord[]>
  setActivityVisibility(input: {
    courseId: string
    hidden: boolean
    moodleActivityId: string
    userId: string
  }): Promise<number>
  userCanAccessCourse(userId: string, courseId: string): Promise<boolean>
  userHasPermission(userId: string, permission: string): Promise<boolean>
}

interface EnrollmentQueryRow {
  enrollment_status: string | null
  last_access: string | null
  last_sync: string | null
  student_id: string
  students: {
    avatar_url: string | null
    current_risk_level: string | null
    email: string | null
    full_name: string
    id: string
    last_access: string | null
    updated_at: string | null
  } | null
}

export function createCoursePanelRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): CoursePanelRepository {
  return {
    async userHasPermission(userId, permission) {
      return checkPermission(supabase, userId, permission)
    },

    async userCanAccessCourse(userId, courseId) {
      return checkCourseAccess(supabase, userId, courseId)
    },

    async findCourse(courseId) {
      const { data, error } = await supabase
        .from('courses')
        .select('id, moodle_course_id, name, short_name, category, start_date, end_date, last_sync, updated_at')
        .eq('id', courseId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null

      return {
        category: data.category,
        endAt: data.end_date,
        id: data.id,
        lastSyncedAt: data.last_sync,
        moodleCourseId: data.moodle_course_id,
        name: data.name,
        shortName: data.short_name,
        startAt: data.start_date,
        updatedAt: data.updated_at,
      }
    },

    async listAccessibleCourseDates(userId) {
      if (await checkApplicationAdmin(supabase, userId)) {
        const rows = await collectCoursePanelPages<{
          category: string | null
          end_date: string | null
          id: string
          start_date: string | null
        }>(async ({ from, to }) => {
          const { data, error } = await supabase
            .from('courses')
            .select('id, category, start_date, end_date')
            .order('id')
            .range(from, to)
          return { data, error }
        })
        return rows.map((course) => ({
          category: course.category,
          endAt: course.end_date,
          id: course.id,
          startAt: course.start_date,
        }))
      }

      const associations = await collectCoursePanelPages<{ course_id: string }>(
        async ({ from, to }) => {
          const { data, error } = await supabase
            .from('user_courses')
            .select('course_id')
            .eq('user_id', userId)
            .order('course_id')
            .range(from, to)
          return { data, error }
        },
      )
      const courseIds = associations.map((association) => association.course_id)
      const rows = (await Promise.all(
        chunkUniqueCoursePanelValues(courseIds).map(async (batch) => {
          const { data, error } = await supabase
            .from('courses')
            .select('id, category, start_date, end_date')
            .in('id', batch)
            .order('id')
          if (error) throw error
          return data ?? []
        }),
      )).flat()

      return rows.map((course) => ({
        category: course.category,
        endAt: course.end_date,
        id: course.id,
        startAt: course.start_date,
      }))
    },

    async listEnrollments(courseId) {
      const rows = await collectCoursePanelPages<EnrollmentQueryRow>(async ({ from, to }) => {
        const { data, error } = await supabase
          .from('student_courses')
          .select('student_id, enrollment_status, last_access, last_sync, students(id, full_name, email, avatar_url, current_risk_level, last_access, updated_at)')
          .eq('course_id', courseId)
          .order('student_id')
          .range(from, to)
        return { data: data as unknown as EnrollmentQueryRow[] | null, error }
      })

      return rows.map((row) => ({
        enrollmentStatus: row.enrollment_status,
        lastAccessAt: row.last_access,
        lastSyncedAt: row.last_sync,
        student: row.students
          ? {
            avatarUrl: row.students.avatar_url,
            email: row.students.email,
            id: row.students.id,
            lastAccessAt: row.students.last_access,
            name: row.students.full_name,
            riskLevel: row.students.current_risk_level,
            updatedAt: row.students.updated_at,
          }
          : null,
        studentId: row.student_id,
      }))
    },

    async listActivities(courseId) {
      const [rows, visibilityOverrideRows] = await Promise.all([
        collectCoursePanelPages<{
          activity_name: string
          activity_type: string | null
          completed_at: string | null
          course_id: string
          due_date: string | null
          grade: number | null
          grade_max: number | null
          graded_at: string | null
          hidden: boolean
          id: string
          moodle_activity_id: string
          percentage: number | null
          status: string | null
          student_id: string
          submitted_at: string | null
          updated_at: string | null
        }>(async ({ from, to }) => {
          const { data, error } = await supabase
            .from('student_activities')
            .select('id, student_id, course_id, moodle_activity_id, activity_name, activity_type, grade, grade_max, percentage, status, completed_at, submitted_at, graded_at, due_date, hidden, updated_at')
            .eq('course_id', courseId)
            .or('activity_type.is.null,activity_type.neq.scorm')
            .order('activity_name')
            .order('moodle_activity_id')
            .order('student_id')
            .order('id')
            .range(from, to)
          return { data, error }
        }),
        collectCoursePanelPages<{
          hidden: boolean
          moodle_activity_id: string
        }>(async ({ from, to }) => {
          const { data, error } = await supabase
            .from('course_activity_visibility_overrides')
            .select('moodle_activity_id, hidden')
            .eq('course_id', courseId)
            .order('moodle_activity_id')
            .range(from, to)
          return { data, error }
        }),
      ])
      const visibilityOverrides = new Map(
        visibilityOverrideRows.map((override) => [
          override.moodle_activity_id,
          override.hidden,
        ]),
      )

      return rows.map((activity) => ({
        activityType: activity.activity_type,
        completedAt: activity.completed_at,
        courseId: activity.course_id,
        dueAt: activity.due_date,
        grade: activity.grade,
        gradedAt: activity.graded_at,
        gradeMax: activity.grade_max,
        hidden: activity.hidden,
        id: activity.id,
        moodleActivityId: activity.moodle_activity_id,
        name: activity.activity_name,
        percentage: activity.percentage,
        status: activity.status,
        studentId: activity.student_id,
        submittedAt: activity.submitted_at,
        updatedAt: activity.updated_at,
        visibilityOverrideHidden: visibilityOverrides.get(activity.moodle_activity_id) ?? null,
      }))
    },

    async isAttendanceEnabled(userId, courseId) {
      const { data, error } = await supabase
        .from('attendance_course_settings')
        .select('id')
        .eq('user_id', userId)
        .eq('course_id', courseId)
        .limit(1)
      if (error) throw error
      return (data?.length ?? 0) > 0
    },

    async setActivityVisibility({ courseId, hidden, moodleActivityId, userId }) {
      const { data, error } = await supabase.rpc(
        'backend_set_course_activity_visibility',
        {
          p_course_id: courseId,
          p_hidden: hidden,
          p_moodle_activity_id: moodleActivityId,
          p_user_id: userId,
        },
      )
      if (error) throw error
      return Number(data ?? 0)
    },
  }
}
