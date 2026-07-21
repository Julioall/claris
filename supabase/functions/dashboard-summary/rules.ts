import {
  getStudentActivityWorkflowStatus,
  isStudentActivityWeightedInGradebook,
} from '../_shared/domain/student-activity-status.ts'
import type { DashboardWeekFilterDto } from './contract.ts'

export const DASHBOARD_TIME_ZONE = 'America/Sao_Paulo' as const

export interface DashboardCourseRuleInput {
  category?: string | null
  endAt?: string | null
  id: string
  startAt?: string | null
}

export interface DashboardEnrollmentRuleInput {
  courseId: string
  status?: string | null
  studentId: string
}

export interface DashboardActivityRuleInput {
  activityType?: string | null
  completedAt?: string | null
  courseId: string
  dueAt?: string | null
  grade?: number | null
  gradeMax?: number | null
  gradedAt?: string | null
  hidden?: boolean | null
  percentage?: number | null
  status?: string | null
  studentId: string
  submittedAt?: string | null
}

export interface DashboardPeriod {
  todayEndsAt: string
  todayStartsAt: string
  weekEndsAt: string
  weekStartsAt: string
}

interface CivilDate {
  day: number
  month: number
  year: number
}

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: DASHBOARD_TIME_ZONE,
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
  month: '2-digit',
  second: '2-digit',
  timeZone: DASHBOARD_TIME_ZONE,
  year: 'numeric',
})

function partsToNumbers(parts: Intl.DateTimeFormatPart[]) {
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>
}

function getCivilDate(date: Date): CivilDate {
  const parts = partsToNumbers(dateFormatter.formatToParts(date))
  return { day: parts.day, month: parts.month, year: parts.year }
}

function addCivilDays(date: CivilDate, days: number): CivilDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth() + 1,
    year: shifted.getUTCFullYear(),
  }
}

function localMidnightToUtc(date: CivilDate): Date {
  const targetAsUtc = Date.UTC(date.year, date.month - 1, date.day)
  let candidate = targetAsUtc

  // Iterate because the timezone offset may differ between the initial UTC
  // guess and local midnight on daylight-saving transitions.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = partsToNumbers(dateTimeFormatter.formatToParts(new Date(candidate)))
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    )
    const correction = targetAsUtc - representedAsUtc
    candidate += correction
    if (correction === 0) break
  }

  return new Date(candidate)
}

export function getDashboardPeriod(
  now: Date,
  week: DashboardWeekFilterDto,
): DashboardPeriod {
  const today = getCivilDate(now)
  const civilDayOfWeek = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay()
  const daysSinceMonday = (civilDayOfWeek + 6) % 7
  const currentWeekStart = addCivilDays(today, -daysSinceMonday)
  const selectedWeekStart = week === 'last'
    ? addCivilDays(currentWeekStart, -7)
    : currentWeekStart

  return {
    todayEndsAt: localMidnightToUtc(addCivilDays(today, 1)).toISOString(),
    todayStartsAt: localMidnightToUtc(today).toISOString(),
    weekEndsAt: localMidnightToUtc(addCivilDays(selectedWeekStart, 7)).toISOString(),
    weekStartsAt: localMidnightToUtc(selectedWeekStart).toISOString(),
  }
}

function splitCategoryPath(category: string): string[] {
  const separator = category.includes(' > ') ? ' > ' : category.includes(' / ') ? ' / ' : null
  return separator
    ? category.split(separator).map((part) => part.trim()).filter(Boolean)
    : [category.trim()].filter(Boolean)
}

function getCourseGroupKey(course: DashboardCourseRuleInput): string {
  const category = course.category?.trim()
  if (!category) return `course:${course.id}`
  const parts = splitCategoryPath(category)
  if (category.includes(' > ') && parts.length >= 4) return parts.slice(0, 4).join('::')
  if (parts.length >= 3) return parts.slice(0, 3).join('::')
  return category
}

function timestampOrInfinity(value?: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY
}

function hasModuleEndDatePattern(courses: DashboardCourseRuleInput[]): boolean {
  if (courses.length < 2) return false
  const endDates = courses.map((course) => course.endAt?.trim()).filter(Boolean) as string[]
  if (endDates.length < 2) return false
  const frequencies = new Map<string, number>()
  endDates.forEach((endAt) => frequencies.set(endAt, (frequencies.get(endAt) ?? 0) + 1))
  return Math.max(...frequencies.values()) >= Math.ceil(endDates.length * 0.6)
}

export function listOngoingDashboardCourseIds(
  courses: DashboardCourseRuleInput[],
  now: Date,
): string[] {
  const groups = new Map<string, Array<{ course: DashboardCourseRuleInput; index: number }>>()
  courses.forEach((course, index) => {
    const key = getCourseGroupKey(course)
    groups.set(key, [...(groups.get(key) ?? []), { course, index }])
  })

  const effectiveEndDates = new Map<string, string | null>()
  groups.forEach((group) => {
    const sorted = [...group].sort((left, right) => (
      timestampOrInfinity(left.course.startAt) - timestampOrInfinity(right.course.startAt)
      || left.index - right.index
    ))
    const modulePattern = hasModuleEndDatePattern(sorted.map(({ course }) => course))
    sorted.forEach(({ course }, index) => {
      const rawEndAt = course.endAt?.trim() || null
      const nextStartAt = sorted[index + 1]?.course.startAt?.trim() || null
      effectiveEndDates.set(
        course.id,
        ((modulePattern && nextStartAt) || (!rawEndAt && nextStartAt)) ? nextStartAt : rawEndAt,
      )
    })
  })

  return courses
    .filter((course) => {
      if (course.startAt && new Date(course.startAt) > now) return false
      const endAt = effectiveEndDates.get(course.id) ?? course.endAt?.trim() ?? null
      return !endAt || new Date(endAt) >= now
    })
    .map((course) => course.id)
}

function normalizeStatus(status?: string | null): string {
  return (status ?? '').trim().toLowerCase()
}

function enrollmentKey(courseId: string, studentId: string): string {
  return `${courseId}:${studentId}`
}

export function getActiveDashboardEnrollmentScope(enrollments: DashboardEnrollmentRuleInput[]) {
  const enrollmentKeys = new Set<string>()
  const studentIds = new Set<string>()

  enrollments.forEach((enrollment) => {
    if (normalizeStatus(enrollment.status) !== 'ativo') return
    enrollmentKeys.add(enrollmentKey(enrollment.courseId, enrollment.studentId))
    studentIds.add(enrollment.studentId)
  })

  return { enrollmentKeys, studentIds }
}

function activityStatusInput(activity: DashboardActivityRuleInput) {
  return {
    activity_type: activity.activityType,
    completed_at: activity.completedAt,
    grade: activity.grade,
    grade_max: activity.gradeMax,
    graded_at: activity.gradedAt,
    percentage: activity.percentage,
    status: activity.status,
    submitted_at: activity.submittedAt,
  }
}

export function isDashboardActivityInScope(
  activity: DashboardActivityRuleInput,
  activeEnrollmentKeys: Set<string>,
): boolean {
  return activity.hidden !== true
    && activeEnrollmentKeys.has(enrollmentKey(activity.courseId, activity.studentId))
}

export function isDashboardActivityPendingCorrection(activity: DashboardActivityRuleInput): boolean {
  const statusInput = activityStatusInput(activity)
  return activity.hidden !== true
    && isStudentActivityWeightedInGradebook(statusInput)
    && getStudentActivityWorkflowStatus(statusInput) === 'pending_correction'
}

export function isDashboardActivityPendingSubmission(
  activity: DashboardActivityRuleInput,
  now: Date,
): boolean {
  const statusInput = activityStatusInput(activity)
  if (
    activity.hidden === true
    || !isStudentActivityWeightedInGradebook(statusInput)
    || getStudentActivityWorkflowStatus(statusInput) !== 'pending_submission'
    || !activity.dueAt
  ) return false

  const dueAt = new Date(activity.dueAt).getTime()
  return Number.isFinite(dueAt) && dueAt < now.getTime()
}

export function countNewAtRiskStudents(
  transitions: Array<{ studentId: string }>,
  activeStudentIds: Set<string>,
): number {
  return new Set(
    transitions
      .filter(({ studentId }) => activeStudentIds.has(studentId))
      .map(({ studentId }) => studentId),
  ).size
}
