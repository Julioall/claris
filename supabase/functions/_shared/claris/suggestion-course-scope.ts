import { listAccessibleCourseIds } from '../auth/mod.ts'
import type { AppSupabaseClient, Tables } from '../db/mod.ts'

type CourseScopeRow = Pick<Tables<'courses'>, 'id' | 'name' | 'category' | 'start_date' | 'end_date'>

export interface SuggestionScopedCourse extends CourseScopeRow {
  effective_end_date: string | null
}

type CourseLifecycleStatus = 'nao_iniciada' | 'em_andamento' | 'finalizada'

function splitCategoryPath(category: string): string[] {
  if (category.includes(' > ')) {
    return category.split(' > ').map((part) => part.trim()).filter(Boolean)
  }

  if (category.includes(' / ')) {
    return category.split(' / ').map((part) => part.trim()).filter(Boolean)
  }

  return [category.trim()].filter(Boolean)
}

function getCourseDateGroupKey(course: Pick<SuggestionScopedCourse, 'id' | 'category'>): string {
  const category = course.category?.trim()
  if (!category) {
    return `course:${course.id}`
  }

  const parts = splitCategoryPath(category)

  if (category.includes(' > ') && parts.length >= 4) {
    return parts.slice(0, 4).join('::')
  }

  if (parts.length >= 3) {
    return parts.slice(0, 3).join('::')
  }

  return category
}

function getSortableStartDate(date?: string | null): number {
  if (!date) return Number.POSITIVE_INFINITY

  const timestamp = new Date(date).getTime()
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY
}

function hasModuleEndDatePattern<T extends Pick<SuggestionScopedCourse, 'end_date'>>(courses: T[]): boolean {
  if (courses.length < 2) return false

  const endDates = courses
    .map((course) => course.end_date?.trim() || null)
    .filter((endDate): endDate is string => Boolean(endDate))

  if (endDates.length < 2) return false

  const endDateFrequency = endDates.reduce<Map<string, number>>((acc, endDate) => {
    acc.set(endDate, (acc.get(endDate) || 0) + 1)
    return acc
  }, new Map())

  const dominantCount = Math.max(...Array.from(endDateFrequency.values()))
  const requiredMajority = Math.ceil(endDates.length * 0.6)

  return dominantCount >= requiredMajority
}

export function withEffectiveCourseDates<T extends CourseScopeRow>(
  courses: T[],
): Array<T & { effective_end_date: string | null }> {
  const groupedCourses = new Map<string, Array<{ course: T; index: number }>>()

  courses.forEach((course, index) => {
    const groupKey = getCourseDateGroupKey(course)
    const group = groupedCourses.get(groupKey) || []
    group.push({ course, index })
    groupedCourses.set(groupKey, group)
  })

  const effectiveEndDates = new Map<string, string | null>()

  groupedCourses.forEach((group) => {
    const sortedGroup = [...group].sort((left, right) => {
      const leftStart = getSortableStartDate(left.course.start_date)
      const rightStart = getSortableStartDate(right.course.start_date)

      if (leftStart !== rightStart) {
        return leftStart - rightStart
      }

      return left.index - right.index
    })

    const moduleBasedEndDate = hasModuleEndDatePattern(sortedGroup.map((item) => item.course))

    sortedGroup.forEach((item, index) => {
      const rawEndDate = item.course.end_date?.trim() || null
      const nextStartDate = sortedGroup[index + 1]?.course.start_date?.trim() || null

      const effectiveEndDate = ((moduleBasedEndDate && nextStartDate) || (!rawEndDate && nextStartDate))
        ? nextStartDate
        : rawEndDate

      effectiveEndDates.set(item.course.id, effectiveEndDate)
    })
  })

  return courses.map((course) => ({
    ...course,
    effective_end_date: effectiveEndDates.get(course.id) ?? course.end_date ?? null,
  }))
}

export function getCourseLifecycleStatus(
  course: Pick<SuggestionScopedCourse, 'start_date' | 'end_date' | 'effective_end_date'>,
  referenceDate: Date = new Date(),
): CourseLifecycleStatus {
  if (course.start_date && new Date(course.start_date) > referenceDate) {
    return 'nao_iniciada'
  }

  const effectiveEndDate = course.effective_end_date?.trim() || course.end_date?.trim() || null
  if (effectiveEndDate && new Date(effectiveEndDate) < referenceDate) {
    return 'finalizada'
  }

  return 'em_andamento'
}

export function filterInProgressCourses<T extends CourseScopeRow>(
  courses: T[],
  referenceDate: Date = new Date(),
): Array<T & { effective_end_date: string | null }> {
  return withEffectiveCourseDates(courses).filter(
    (course) => getCourseLifecycleStatus(course, referenceDate) === 'em_andamento',
  )
}

export async function listTutorSuggestionCourses(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<SuggestionScopedCourse[]> {
  const accessibleCourseIds = await listAccessibleCourseIds(supabase, userId, 'tutor')
  if (accessibleCourseIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('courses')
    .select('id, name, category, start_date, end_date')
    .in('id', accessibleCourseIds)

  if (error) throw error

  const uniqueCourses = new Map<string, CourseScopeRow>()

  for (const course of (data ?? []) as CourseScopeRow[]) {
    if (!course.id) continue

    uniqueCourses.set(course.id, {
      id: course.id,
      name: course.name,
      category: course.category,
      start_date: course.start_date,
      end_date: course.end_date,
    })
  }

  return filterInProgressCourses(Array.from(uniqueCourses.values()))
}

export async function listTutorSuggestionCourseIds(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<string[]> {
  const courses = await listTutorSuggestionCourses(supabase, userId)
  return courses.map((course) => course.id)
}
