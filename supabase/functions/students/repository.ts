import {
  isApplicationAdmin as checkApplicationAdmin,
  userHasPermission as checkPermission,
} from '../_shared/auth/mod.ts'
import {
  createServiceClient,
  type AppSupabaseClient,
} from '../_shared/db/mod.ts'
import {
  chunkUniqueStudentsValues,
  collectStudentsPages,
} from './pagination.ts'
import type {
  StudentActivityRuleInput,
  StudentCourseRuleInput,
  StudentGradeRuleInput,
  StudentSnapshotRuleInput,
} from './rules.ts'

export interface StudentListRecord {
  avatarUrl: string | null
  email: string | null
  enrollmentStatus: string
  id: string
  lastAccessAt: string | null
  name: string
  riskLevel: string | null
}

export interface StudentListRepositoryPage {
  items: StudentListRecord[]
  totalCount: number
}

export interface StudentProfileRecord {
  avatarUrl: string | null
  city: string | null
  createdAt: string | null
  email: string | null
  id: string
  lastAccessAt: string | null
  mobilePhone: string | null
  moodleUserId: string
  name: string
  phone: string | null
  phoneNumber: string | null
  riskLevel: string | null
  riskReasons: string[]
  tags: string[]
  updatedAt: string | null
}

export interface StudentCourseRecord extends StudentCourseRuleInput {
  updatedAt: string | null
}

export interface StudentGradeRecord extends StudentGradeRuleInput {
  updatedAt: string | null
}

export interface StudentActivityRecord extends StudentActivityRuleInput {
  updatedAt: string | null
}

export type StudentSnapshotRecord = StudentSnapshotRuleInput

export interface StudentsRepository {
  findStudent(studentId: string): Promise<StudentProfileRecord | null>
  listActivities(input: {
    courseIds: string[]
    includeHidden: boolean
    studentId: string
  }): Promise<StudentActivityRecord[]>
  listCourses(courseIds: string[]): Promise<StudentCourseRecord[]>
  listGrades(studentId: string, courseIds: string[]): Promise<StudentGradeRecord[]>
  listSnapshots(studentId: string, courseIds: string[], limit: number): Promise<StudentSnapshotRecord[]>
  listStudentCourseIds(userId: string, studentId: string): Promise<string[]>
  listStudentsPage(input: {
    courseId?: string
    enrollmentStatus?: string
    limit: number
    offset: number
    riskLevel?: string
    search?: string
    userId: string
  }): Promise<StudentListRepositoryPage>
  userCanAccessStudent(userId: string, studentId: string): Promise<boolean>
  userHasPermission(userId: string, permission: string): Promise<boolean>
}

interface BackendStudentsPageRow {
  avatar_url: string | null
  current_risk_level: string | null
  email: string | null
  enrollment_status: string
  full_name: string
  id: string
  last_access: string | null
}

interface BackendStudentsPageResult {
  items: BackendStudentsPageRow[]
  total_count: number
}

function parseBackendStudentsPage(value: unknown): BackendStudentsPageResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid backend students page result')
  }
  const result = value as Record<string, unknown>
  if (!Array.isArray(result.items) || !Number.isSafeInteger(result.total_count) || (result.total_count as number) < 0) {
    throw new Error('Invalid backend students page result')
  }
  const items = result.items.map((value): BackendStudentsPageRow => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid backend student row')
    }
    const row = value as Record<string, unknown>
    if (
      typeof row.id !== 'string'
      || typeof row.full_name !== 'string'
      || (row.email !== null && typeof row.email !== 'string')
      || (row.avatar_url !== null && typeof row.avatar_url !== 'string')
      || (row.current_risk_level !== null && typeof row.current_risk_level !== 'string')
      || (row.last_access !== null && typeof row.last_access !== 'string')
      || typeof row.enrollment_status !== 'string'
    ) throw new Error('Invalid backend student row')
    return row as unknown as BackendStudentsPageRow
  })
  return { items, total_count: result.total_count as number }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

export function createStudentsRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): StudentsRepository {
  return {
    async userHasPermission(userId, permission) {
      return checkPermission(supabase, userId, permission)
    },

    async userCanAccessStudent(userId, studentId) {
      const { data, error } = await supabase.rpc('user_has_student_access', {
        p_student_id: studentId,
        p_user_id: userId,
      } as never)
      if (error) throw error
      return data === true
    },

    async listStudentsPage(input) {
      const { data, error } = await supabase.rpc('backend_list_students_page' as never, {
        p_course_id: input.courseId ?? null,
        p_limit: input.limit,
        p_offset: input.offset,
        p_risk_filter: input.riskLevel ?? null,
        p_search: input.search ?? null,
        p_status_filter: input.enrollmentStatus ?? null,
        p_user_id: input.userId,
      } as never)
      if (error) throw error
      const page = parseBackendStudentsPage(data)
      return {
        items: page.items.map((row) => ({
          avatarUrl: row.avatar_url,
          email: row.email,
          enrollmentStatus: row.enrollment_status,
          id: row.id,
          lastAccessAt: row.last_access,
          name: row.full_name,
          riskLevel: row.current_risk_level,
        })),
        totalCount: page.total_count,
      }
    },

    async findStudent(studentId) {
      const { data, error } = await supabase
        .from('students')
        .select('id, moodle_user_id, full_name, email, city, phone, phone_number, mobile_phone, avatar_url, current_risk_level, risk_reasons, tags, last_access, created_at, updated_at')
        .eq('id', studentId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        avatarUrl: data.avatar_url,
        city: data.city,
        createdAt: data.created_at,
        email: data.email,
        id: data.id,
        lastAccessAt: data.last_access,
        mobilePhone: data.mobile_phone,
        moodleUserId: data.moodle_user_id,
        name: data.full_name,
        phone: data.phone,
        phoneNumber: data.phone_number,
        riskLevel: data.current_risk_level,
        riskReasons: data.risk_reasons ?? [],
        tags: data.tags ?? [],
        updatedAt: data.updated_at,
      }
    },

    async listStudentCourseIds(userId, studentId) {
      const enrollmentRows = await collectStudentsPages<{ course_id: string }>(async ({ from, to }) => {
        const { data, error } = await supabase
          .from('student_courses')
          .select('course_id')
          .eq('student_id', studentId)
          .order('course_id')
          .range(from, to)
        return { data, error }
      })
      const enrolledCourseIds = uniqueSorted(enrollmentRows.map((row) => row.course_id))
      if (enrolledCourseIds.length === 0) return []
      if (await checkApplicationAdmin(supabase, userId)) return enrolledCourseIds

      const associationRows = (await Promise.all(
        chunkUniqueStudentsValues(enrolledCourseIds).map(async (courseIds) => {
          const { data, error } = await supabase
            .from('user_courses')
            .select('course_id')
            .eq('user_id', userId)
            .in('course_id', courseIds)
            .order('course_id')
          if (error) throw error
          return data ?? []
        }),
      )).flat()
      return uniqueSorted(associationRows.map((row) => row.course_id))
    },

    async listCourses(courseIds) {
      if (courseIds.length === 0) return []
      const rows = (await Promise.all(
        chunkUniqueStudentsValues(courseIds).map(async (batch) => {
          const { data, error } = await supabase
            .from('courses')
            .select('id, name, short_name, start_date, end_date, updated_at')
            .in('id', batch)
            .order('name')
            .order('id')
          if (error) throw error
          return data ?? []
        }),
      )).flat()
      return rows.map((course) => ({
        endAt: course.end_date,
        id: course.id,
        name: course.name,
        shortName: course.short_name,
        startAt: course.start_date,
        updatedAt: course.updated_at,
      }))
    },

    async listGrades(studentId, courseIds) {
      if (courseIds.length === 0) return []
      const rows = (await Promise.all(
        chunkUniqueStudentsValues(courseIds).map((batch) => (
          collectStudentsPages<{
            course_id: string
            grade_formatted: string | null
            grade_max: number | null
            grade_percentage: number | null
            grade_raw: number | null
            id: string
            last_sync: string | null
            letter_grade: string | null
            updated_at: string | null
          }>(async ({ from, to }) => {
            const { data, error } = await supabase
              .from('student_course_grades')
              .select('id, course_id, grade_raw, grade_max, grade_percentage, grade_formatted, letter_grade, last_sync, updated_at')
              .eq('student_id', studentId)
              .in('course_id', batch)
              .order('course_id')
              .order('id')
              .range(from, to)
            return { data, error }
          })
        )),
      )).flat()
      return rows.map((grade) => ({
        courseId: grade.course_id,
        formatted: grade.grade_formatted,
        id: grade.id,
        lastSyncedAt: grade.last_sync,
        letter: grade.letter_grade,
        maximum: grade.grade_max,
        percentage: grade.grade_percentage,
        raw: grade.grade_raw,
        updatedAt: grade.updated_at,
      }))
    },

    async listActivities({ courseIds, includeHidden, studentId }) {
      if (courseIds.length === 0) return []
      const rows = (await Promise.all(
        chunkUniqueStudentsValues(courseIds).map((batch) => (
          collectStudentsPages<{
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
            submitted_at: string | null
            updated_at: string | null
          }>(async ({ from, to }) => {
            let query = supabase
              .from('student_activities')
              .select('id, course_id, moodle_activity_id, activity_name, activity_type, grade, grade_max, percentage, status, due_date, hidden, completed_at, submitted_at, graded_at, updated_at')
              .eq('student_id', studentId)
              .in('course_id', batch)
            if (!includeHidden) query = query.eq('hidden', false)
            const { data, error } = await query
              .order('course_id')
              .order('activity_name')
              .order('id')
              .range(from, to)
            return { data, error }
          })
        )),
      )).flat()
      return rows.map((activity) => ({
        activityType: activity.activity_type,
        completedAt: activity.completed_at,
        courseId: activity.course_id,
        dueAt: activity.due_date,
        grade: activity.grade,
        gradeMaximum: activity.grade_max,
        gradedAt: activity.graded_at,
        hidden: activity.hidden,
        id: activity.id,
        moodleActivityId: activity.moodle_activity_id,
        name: activity.activity_name,
        percentage: activity.percentage,
        status: activity.status,
        submittedAt: activity.submitted_at,
        updatedAt: activity.updated_at,
      }))
    },

    async listSnapshots(studentId, courseIds, limit) {
      if (courseIds.length === 0) return []
      const rows = (await Promise.all(
        chunkUniqueStudentsValues(courseIds).map(async (batch) => {
          const { data, error } = await supabase
            .from('student_sync_snapshots')
            .select('id, course_id, synced_at, risk_level, enrollment_status, last_access, days_since_access, pending_activities, overdue_activities, created_at')
            .eq('student_id', studentId)
            .in('course_id', batch)
            .order('synced_at', { ascending: false })
            .order('id')
            .limit(limit)
          if (error) throw error
          return data ?? []
        }),
      )).flat()
        .sort((left, right) => (
          Date.parse(right.synced_at) - Date.parse(left.synced_at) || left.id.localeCompare(right.id)
        ))
        .slice(0, limit)
      return rows.map((snapshot) => ({
        courseId: snapshot.course_id,
        createdAt: snapshot.created_at,
        daysSinceAccess: snapshot.days_since_access,
        enrollmentStatus: snapshot.enrollment_status,
        id: snapshot.id,
        lastAccessAt: snapshot.last_access,
        overdueActivities: snapshot.overdue_activities,
        pendingActivities: snapshot.pending_activities,
        riskLevel: snapshot.risk_level,
        synchronizedAt: snapshot.synced_at,
      }))
    },
  }
}
