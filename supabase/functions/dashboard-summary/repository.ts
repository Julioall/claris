import { userHasPermission } from '../_shared/auth/mod.ts'
import {
  createServiceClient,
  type AppSupabaseClient,
  type Json,
} from '../_shared/db/mod.ts'
import type { DashboardRiskLevelDto } from './contract.ts'
import type {
  DashboardActivityRuleInput,
  DashboardCourseRuleInput,
  DashboardEnrollmentRuleInput,
} from './rules.ts'

export interface DashboardCourseRecord extends DashboardCourseRuleInput {
  name: string
  shortName?: string | null
}

export interface DashboardStudentRecord {
  avatarUrl?: string | null
  id: string
  lastAccessAt?: string | null
  name: string
  riskLevel?: DashboardRiskLevelDto | null
  riskReasons?: string[] | null
  updatedAt?: string | null
}

export interface DashboardActivityRecord extends DashboardActivityRuleInput {
  id: string
  name: string
}

export interface DashboardFeedRecord {
  courseId?: string | null
  description?: string | null
  eventType: string
  id: string
  metadata?: Record<string, unknown>
  occurredAt?: string | null
  studentId?: string | null
  title: string
}

export interface DashboardSummaryRepository {
  countEvents(input: { endsAt: string; startsAt: string; userId: string }): Promise<number>
  countTasks(input: { endsAt: string; startsAt: string; userId: string }): Promise<number>
  getDataUpdatedAt(courseIds: string[]): Promise<string | null>
  listActivities(courseIds: string[]): Promise<DashboardActivityRecord[]>
  listCourses(courseIds: string[]): Promise<DashboardCourseRecord[]>
  listEnrollments(courseIds: string[]): Promise<DashboardEnrollmentRuleInput[]>
  listFeed(input: {
    courseFilter?: string
    courseIds: string[]
    studentIds: string[]
    userId: string
  }): Promise<DashboardFeedRecord[]>
  listRiskTransitions(input: {
    endsAt: string
    startsAt: string
    studentIds: string[]
  }): Promise<Array<{ studentId: string }>>
  listStudents(studentIds: string[]): Promise<DashboardStudentRecord[]>
  listTutorCourseIds(userId: string): Promise<string[]>
  userCanViewDashboard(userId: string): Promise<boolean>
}

const PAGE_SIZE = 1000
const BATCH_SIZE = 100
const FEED_LIMIT = 20

function chunks<T>(values: T[], size = BATCH_SIZE): T[][] {
  const unique = [...new Set(values)]
  const result: T[][] = []
  for (let index = 0; index < unique.length; index += size) {
    result.push(unique.slice(index, index + size))
  }
  return result
}

async function paginate<T>(
  fetchPage: (page: number) => Promise<{ data: T[] | null; error: unknown | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let page = 0; ; page += 1) {
    const { data, error } = await fetchPage(page)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

async function allBatches<T>(
  values: string[],
  fetchBatch: (batch: string[]) => Promise<T[]>,
): Promise<T[]> {
  if (values.length === 0) return []
  return (await Promise.all(chunks(values).map(fetchBatch))).flat()
}

function asMetadata(value: Json | null): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

export function createDashboardSummaryRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): DashboardSummaryRepository {
  return {
    async userCanViewDashboard(userId) {
      return userHasPermission(supabase, userId, 'dashboard.view')
    },

    async listTutorCourseIds(userId) {
      const rows = await paginate<{ course_id: string }>(async (page) => {
        const { data, error } = await supabase
          .from('user_courses')
          .select('course_id')
          .eq('user_id', userId)
          .eq('role', 'tutor')
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        return { data, error }
      })
      return [...new Set(rows.map((row) => row.course_id))]
    },

    async listCourses(courseIds) {
      return allBatches(courseIds, async (batch) => {
        const { data, error } = await supabase
          .from('courses')
          .select('id, name, short_name, category, start_date, end_date')
          .in('id', batch)
        if (error) throw error
        return (data ?? []).map((course) => ({
          category: course.category,
          endAt: course.end_date,
          id: course.id,
          name: course.name,
          shortName: course.short_name,
          startAt: course.start_date,
        }))
      })
    },

    async listEnrollments(courseIds) {
      return allBatches(courseIds, async (batch) => {
        const rows = await paginate<{
          course_id: string
          enrollment_status: string | null
          student_id: string
        }>(async (page) => {
          const { data, error } = await supabase
            .from('student_courses')
            .select('course_id, student_id, enrollment_status')
            .in('course_id', batch)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
          return { data, error }
        })
        return rows.map((enrollment) => ({
          courseId: enrollment.course_id,
          status: enrollment.enrollment_status,
          studentId: enrollment.student_id,
        }))
      })
    },

    async listStudents(studentIds) {
      return allBatches(studentIds, async (batch) => {
        const { data, error } = await supabase
          .from('students')
          .select('id, full_name, avatar_url, current_risk_level, risk_reasons, last_access, updated_at')
          .in('id', batch)
        if (error) throw error
        return (data ?? []).map((student) => ({
          avatarUrl: student.avatar_url,
          id: student.id,
          lastAccessAt: student.last_access,
          name: student.full_name,
          riskLevel: student.current_risk_level,
          riskReasons: student.risk_reasons,
          updatedAt: student.updated_at,
        }))
      })
    },

    async listRiskTransitions({ endsAt, startsAt, studentIds }) {
      return allBatches(studentIds, async (batch) => {
        const rows = await paginate<{ student_id: string }>(async (page) => {
          const { data, error } = await supabase
            .from('risk_history')
            .select('student_id')
            .in('student_id', batch)
            .in('new_level', ['risco', 'critico'])
            .gte('created_at', startsAt)
            .lt('created_at', endsAt)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
          return { data, error }
        })
        return rows.map(({ student_id }) => ({ studentId: student_id }))
      })
    },

    async listActivities(courseIds) {
      return allBatches(courseIds, async (batch) => {
        const rows = await paginate<{
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
          percentage: number | null
          status: string | null
          student_id: string
          submitted_at: string | null
        }>(async (page) => {
          const { data, error } = await supabase
            .from('student_activities')
            .select('id, activity_name, activity_type, student_id, course_id, due_date, submitted_at, completed_at, graded_at, grade, grade_max, percentage, status, hidden')
            .in('course_id', batch)
            .in('activity_type', ['assign', 'assignment'])
            .eq('hidden', false)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
          return { data, error }
        })
        return rows.map((activity) => ({
          activityType: activity.activity_type,
          completedAt: activity.completed_at,
          courseId: activity.course_id,
          dueAt: activity.due_date,
          grade: activity.grade,
          gradeMax: activity.grade_max,
          gradedAt: activity.graded_at,
          hidden: activity.hidden,
          id: activity.id,
          name: activity.activity_name,
          percentage: activity.percentage,
          status: activity.status,
          studentId: activity.student_id,
          submittedAt: activity.submitted_at,
        }))
      })
    },

    async countEvents({ endsAt, startsAt, userId }) {
      const { count, error } = await supabase
        .from('calendar_events')
        .select('id', { count: 'exact', head: true })
        .eq('owner', userId)
        .gte('start_at', startsAt)
        .lt('start_at', endsAt)
      if (error) throw error
      return count ?? 0
    },

    async countTasks({ endsAt, startsAt, userId }) {
      const { count, error } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
        .gte('due_date', startsAt)
        .lt('due_date', endsAt)
        .neq('status', 'done')
      if (error) throw error
      return count ?? 0
    },

    async listFeed({ courseFilter, courseIds, studentIds, userId }) {
      const ownQuery = supabase
        .from('activity_feed')
        .select('id, user_id, student_id, course_id, event_type, title, description, metadata, created_at')
        .eq('user_id', userId)
      const ownResult = await (courseFilter ? ownQuery.eq('course_id', courseFilter) : ownQuery)
        .order('created_at', { ascending: false })
        .limit(FEED_LIMIT)
      if (ownResult.error) throw ownResult.error

      const scopedCourseRows = await allBatches(courseIds, async (batch) => {
        const { data, error } = await supabase
          .from('activity_feed')
          .select('id, user_id, student_id, course_id, event_type, title, description, metadata, created_at')
          .in('course_id', batch)
          .order('created_at', { ascending: false })
          .limit(FEED_LIMIT)
        if (error) throw error
        return data ?? []
      })

      const studentOnlyRows = await allBatches(studentIds, async (batch) => {
        const { data, error } = await supabase
          .from('activity_feed')
          .select('id, user_id, student_id, course_id, event_type, title, description, metadata, created_at')
          .in('student_id', batch)
          .is('course_id', null)
          .order('created_at', { ascending: false })
          .limit(FEED_LIMIT)
        if (error) throw error
        return data ?? []
      })

      const byId = new Map([
        ...(ownResult.data ?? []),
        ...scopedCourseRows,
        ...studentOnlyRows,
      ].map((row) => [row.id, row]))

      return [...byId.values()]
        .sort((left, right) => String(right.created_at ?? '').localeCompare(String(left.created_at ?? '')))
        .slice(0, FEED_LIMIT)
        .map((row) => ({
          courseId: row.course_id,
          description: row.description,
          eventType: row.event_type,
          id: row.id,
          metadata: asMetadata(row.metadata),
          occurredAt: row.created_at,
          studentId: row.student_id,
          title: row.title,
        }))
    },

    async getDataUpdatedAt(courseIds) {
      const rows = await allBatches(courseIds, async (batch) => {
        const { data, error } = await supabase
          .from('dashboard_course_activity_aggregates')
          .select('course_id, updated_at')
          .in('course_id', batch)
        if (error) throw error
        return data ?? []
      })
      const latestByCourse = new Map(rows.map((row) => [row.course_id, row.updated_at]))
      if (courseIds.some((courseId) => !latestByCourse.has(courseId))) return null
      return [...latestByCourse.values()].sort()[0] ?? null
    },
  }
}
