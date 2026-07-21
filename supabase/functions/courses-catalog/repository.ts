import {
  listAccessibleCourseIds,
  userHasPermission as checkUserPermission,
} from '../_shared/auth/mod.ts'
import {
  createServiceClient,
  type AppSupabaseClient,
} from '../_shared/db/mod.ts'
import type { CourseAssociationRoleDto } from './contract.ts'
import type { CourseCatalogPermission } from './rules.ts'

export interface CourseCatalogRecord {
  atRiskStudentCount: number
  category: string | null
  createdAt: string | null
  endsAt: string | null
  id: string
  isAttendanceEnabled: boolean
  isFollowing: boolean
  isIgnored: boolean
  lastSynchronizedAt: string | null
  moodleCourseId: string
  name: string
  shortName: string | null
  startsAt: string | null
  studentCount: number
  studentIds: string[]
  updatedAt: string | null
}

export interface CourseCatalogRepository {
  hasCourseAssociationScope(userId: string, courseIds: string[]): Promise<boolean>
  getCatalog(userId: string): Promise<CourseCatalogRecord[]>
  setAssociationRole(input: {
    courseIds: string[]
    role: CourseAssociationRoleDto
    userId: string
  }): Promise<number>
  setAttendanceEnabled(input: {
    courseIds: string[]
    enabled: boolean
    userId: string
  }): Promise<number>
  setIgnored(input: {
    courseIds: string[]
    ignored: boolean
    userId: string
  }): Promise<number>
  userHasPermission(userId: string, permission: CourseCatalogPermission): Promise<boolean>
}

interface CatalogRpcRow {
  at_risk_count?: number | string | null
  category?: string | null
  created_at?: string | null
  end_date?: string | null
  id: string
  is_attendance_enabled?: boolean | null
  is_following?: boolean | null
  is_ignored?: boolean | null
  last_sync?: string | null
  moodle_course_id: string
  name: string
  short_name?: string | null
  start_date?: string | null
  student_count?: number | string | null
  student_ids?: unknown
  updated_at?: string | null
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function nonNegativeCount(value: number | string | null | undefined, field: string): number {
  const count = typeof value === 'number' ? value : Number(value ?? 0)
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Invalid ${field} returned by course catalog RPC`)
  }
  return count
}

function affectedCourseCount(value: unknown): number {
  const count = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim().length > 0
    ? Number(value)
    : Number.NaN
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Invalid affected course count returned by command RPC')
  }
  return count
}

function mapCatalogRow(row: CatalogRpcRow): CourseCatalogRecord {
  const studentIds = Array.isArray(row.student_ids)
    ? [...new Set(row.student_ids.filter((value): value is string => typeof value === 'string'))]
    : []

  return {
    atRiskStudentCount: nonNegativeCount(row.at_risk_count, 'at_risk_count'),
    category: nullableString(row.category),
    createdAt: nullableString(row.created_at),
    endsAt: nullableString(row.end_date),
    id: row.id,
    isAttendanceEnabled: row.is_attendance_enabled === true,
    isFollowing: row.is_following === true,
    isIgnored: row.is_ignored === true,
    lastSynchronizedAt: nullableString(row.last_sync),
    moodleCourseId: row.moodle_course_id,
    name: row.name,
    shortName: nullableString(row.short_name),
    startsAt: nullableString(row.start_date),
    studentCount: nonNegativeCount(row.student_count, 'student_count'),
    studentIds,
    updatedAt: nullableString(row.updated_at),
  }
}

export function createCourseCatalogRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): CourseCatalogRepository {
  return {
    async hasCourseAssociationScope(userId, courseIds) {
      const accessibleCourseIds = new Set(
        await listAccessibleCourseIds(supabase, userId),
      )
      return courseIds.every((courseId) => accessibleCourseIds.has(courseId))
    },

    async userHasPermission(userId, permission) {
      return checkUserPermission(supabase, userId, permission)
    },

    async getCatalog(userId) {
      const { data, error } = await supabase.rpc('get_user_courses_catalog_with_stats', {
        p_user_id: userId,
      })
      if (error) throw error
      return ((data ?? []) as unknown as CatalogRpcRow[]).map(mapCatalogRow)
    },

    async setAssociationRole({ courseIds, role, userId }) {
      const { data, error } = await supabase.rpc('backend_set_user_course_roles', {
        p_course_ids: courseIds,
        p_role: role,
        p_user_id: userId,
      })
      if (error) throw error
      return affectedCourseCount(data)
    },

    async setIgnored({ courseIds, ignored, userId }) {
      const { data, error } = await supabase.rpc('backend_set_user_courses_ignored', {
        p_course_ids: courseIds,
        p_ignored: ignored,
        p_user_id: userId,
      })
      if (error) throw error
      return affectedCourseCount(data)
    },

    async setAttendanceEnabled({ courseIds, enabled, userId }) {
      const { data, error } = await supabase.rpc('backend_set_course_attendance_enabled', {
        p_course_ids: courseIds,
        p_enabled: enabled,
        p_user_id: userId,
      })
      if (error) throw error
      return affectedCourseCount(data)
    },
  }
}
