import type {
  CourseCatalogAction,
  CourseLifecycleStatusDto,
} from './contract.ts'

export const COURSE_CATALOG_VIEW_PERMISSION = 'courses.catalog.view' as const
export const SCHOOLS_VIEW_PERMISSION = 'schools.view' as const
export const COURSE_ATTENDANCE_MANAGE_PERMISSION = 'courses.attendance.manage' as const

export type CourseCatalogPermission =
  | typeof COURSE_CATALOG_VIEW_PERMISSION
  | typeof SCHOOLS_VIEW_PERMISSION
  | typeof COURSE_ATTENDANCE_MANAGE_PERMISSION

const COURSE_CATALOG_ACTION_PERMISSIONS = {
  get_catalog: [
    COURSE_CATALOG_VIEW_PERMISSION,
    SCHOOLS_VIEW_PERMISSION,
  ],
  set_association_role: [
    COURSE_CATALOG_VIEW_PERMISSION,
    SCHOOLS_VIEW_PERMISSION,
  ],
  set_ignored: [
    COURSE_CATALOG_VIEW_PERMISSION,
    SCHOOLS_VIEW_PERMISSION,
  ],
  set_attendance_enabled: [COURSE_ATTENDANCE_MANAGE_PERMISSION],
} as const satisfies Record<CourseCatalogAction, readonly CourseCatalogPermission[]>

export interface CourseDateRuleInput {
  category: string | null
  endsAt: string | null
  id: string
  startsAt: string | null
}

export function allowedPermissionsForCourseCatalogAction(
  action: CourseCatalogAction,
): readonly CourseCatalogPermission[] {
  return COURSE_CATALOG_ACTION_PERMISSIONS[action]
}

export async function canExecuteCourseCatalogAction(
  action: CourseCatalogAction,
  hasPermission: (permission: CourseCatalogPermission) => Promise<boolean>,
): Promise<boolean> {
  const results = await Promise.all(
    allowedPermissionsForCourseCatalogAction(action).map(hasPermission),
  )
  return results.some(Boolean)
}

function splitCategoryPath(category: string): string[] {
  if (category.includes(' > ')) {
    return category.split(' > ').map((part) => part.trim()).filter(Boolean)
  }
  if (category.includes(' / ')) {
    return category.split(' / ').map((part) => part.trim()).filter(Boolean)
  }
  return [category.trim()].filter(Boolean)
}

function courseDateGroupKey(course: Pick<CourseDateRuleInput, 'category' | 'id'>): string {
  const category = course.category?.trim()
  if (!category) return `course:${course.id}`

  const parts = splitCategoryPath(category)
  if (category.includes(' > ') && parts.length >= 4) {
    return parts.slice(0, 4).join('::')
  }
  if (parts.length >= 3) return parts.slice(0, 3).join('::')
  return category
}

function sortableTimestamp(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY
}

function hasModuleEndDatePattern(courses: CourseDateRuleInput[]): boolean {
  if (courses.length < 2) return false

  const endDates = courses
    .map((course) => course.endsAt?.trim() || null)
    .filter((endDate): endDate is string => Boolean(endDate))
  if (endDates.length < 2) return false

  const frequencies = new Map<string, number>()
  endDates.forEach((endDate) => {
    frequencies.set(endDate, (frequencies.get(endDate) ?? 0) + 1)
  })
  return Math.max(...frequencies.values()) >= Math.ceil(endDates.length * 0.6)
}

export function withEffectiveCourseCatalogDates<TCourse extends CourseDateRuleInput>(
  courses: TCourse[],
): Array<TCourse & { effectiveEndsAt: string | null }> {
  const groups = new Map<string, Array<{ course: TCourse; index: number }>>()
  courses.forEach((course, index) => {
    const key = courseDateGroupKey(course)
    groups.set(key, [...(groups.get(key) ?? []), { course, index }])
  })

  const effectiveEndDates = new Map<string, string | null>()
  groups.forEach((group) => {
    const sorted = [...group].sort((left, right) => (
      sortableTimestamp(left.course.startsAt) - sortableTimestamp(right.course.startsAt)
      || left.index - right.index
    ))
    const inferModuleEnd = hasModuleEndDatePattern(sorted.map(({ course }) => course))

    sorted.forEach(({ course }, index) => {
      const rawEnd = course.endsAt?.trim() || null
      const nextStart = sorted[index + 1]?.course.startsAt?.trim() || null
      const effectiveEnd = ((inferModuleEnd && nextStart) || (!rawEnd && nextStart))
        ? nextStart
        : rawEnd
      effectiveEndDates.set(course.id, effectiveEnd)
    })
  })

  return courses.map((course) => ({
    ...course,
    effectiveEndsAt: effectiveEndDates.get(course.id) ?? course.endsAt?.trim() ?? null,
  }))
}

export function getCourseCatalogLifecycleStatus(
  course: Pick<CourseDateRuleInput, 'endsAt' | 'startsAt'> & { effectiveEndsAt: string | null },
  referenceDate: Date = new Date(),
): CourseLifecycleStatusDto {
  if (course.startsAt && new Date(course.startsAt) > referenceDate) return 'nao_iniciada'

  const effectiveEnd = course.effectiveEndsAt?.trim() || course.endsAt?.trim() || null
  return effectiveEnd && new Date(effectiveEnd) < referenceDate
    ? 'finalizada'
    : 'em_andamento'
}
