import {
  getStudentActivityWorkflowStatus,
  type StudentActivityWorkflowStatus,
} from '../_shared/domain/student-activity-status.ts'
import {
  COURSE_PANEL_RISK_LEVELS,
  type CoursePanelActivityDto,
  type CoursePanelLifecycleDto,
  type CoursePanelRiskLevelDto,
  type CoursePanelStatsDto,
  type CoursePanelSubmissionCountsDto,
  type CoursePanelSubmissionDto,
  type CoursePanelWorkflowStatusDto,
} from './contract.ts'

export interface CoursePanelCourseDateRuleInput {
  category?: string | null
  endAt?: string | null
  id: string
  startAt?: string | null
}

export interface CoursePanelEnrollmentRuleInput {
  enrollmentStatus?: string | null
  studentId: string
}

export interface CoursePanelStudentRuleInput {
  id: string
  riskLevel?: string | null
}

export interface CoursePanelActivityRuleInput {
  activityType?: string | null
  completedAt?: string | null
  courseId: string
  dueAt?: string | null
  grade?: number | null
  gradedAt?: string | null
  gradeMax?: number | null
  hidden: boolean
  id: string
  moodleActivityId: string
  name: string
  percentage?: number | null
  status?: string | null
  studentId: string
  submittedAt?: string | null
  visibilityOverrideHidden?: boolean | null
}

const INACTIVE_ENROLLMENT_STATUSES = new Set([
  'suspenso',
  'suspended',
  'inativo',
  'inactive',
  'nao atualmente',
  'not current',
  'not_current',
  'notcurrently',
])

const RISK_ELIGIBLE_ENROLLMENT_STATUSES = new Set(['', 'ativo', 'active'])
const ASSIGNMENT_ACTIVITY_TYPES = new Set(['assign', 'assignment'])

const WORKFLOW_STATUS_MAP: Record<StudentActivityWorkflowStatus, CoursePanelWorkflowStatusDto> = {
  completed: 'completed',
  corrected: 'corrected',
  pending_correction: 'pendingCorrection',
  pending_submission: 'pendingSubmission',
}

function normalizeText(value?: string | null): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function splitCategoryPath(category: string): string[] {
  const separator = category.includes(' > ') ? ' > ' : category.includes(' / ') ? ' / ' : null
  return separator
    ? category.split(separator).map((part) => part.trim()).filter(Boolean)
    : [category.trim()].filter(Boolean)
}

function courseDateGroupKey(course: CoursePanelCourseDateRuleInput): string {
  const category = course.category?.trim()
  if (!category) return `course:${course.id}`
  const parts = splitCategoryPath(category)
  if (category.includes(' > ') && parts.length >= 4) return parts.slice(0, 4).join('::')
  if (parts.length >= 3) return parts.slice(0, 3).join('::')
  return category
}

function sortableTimestamp(value?: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY
}

function hasModuleEndDatePattern(courses: CoursePanelCourseDateRuleInput[]): boolean {
  if (courses.length < 2) return false
  const endDates = courses
    .map((course) => course.endAt?.trim())
    .filter((value): value is string => Boolean(value))
  if (endDates.length < 2) return false

  const frequencies = new Map<string, number>()
  endDates.forEach((endAt) => frequencies.set(endAt, (frequencies.get(endAt) ?? 0) + 1))
  return Math.max(...frequencies.values()) >= Math.ceil(endDates.length * 0.6)
}

export function getEffectiveCourseEndDate(
  courseId: string,
  courses: CoursePanelCourseDateRuleInput[],
): string | null {
  const groups = new Map<string, CoursePanelCourseDateRuleInput[]>()
  courses.forEach((course) => {
    const key = courseDateGroupKey(course)
    groups.set(key, [...(groups.get(key) ?? []), course])
  })

  for (const group of groups.values()) {
    if (!group.some((course) => course.id === courseId)) continue
    const sorted = [...group].sort((left, right) => (
      sortableTimestamp(left.startAt) - sortableTimestamp(right.startAt)
      || left.id.localeCompare(right.id)
    ))
    const modulePattern = hasModuleEndDatePattern(sorted)
    const index = sorted.findIndex((course) => course.id === courseId)
    const course = sorted[index]
    const rawEndAt = course.endAt?.trim() || null
    const nextStartAt = sorted[index + 1]?.startAt?.trim() || null
    return ((modulePattern && nextStartAt) || (!rawEndAt && nextStartAt))
      ? nextStartAt
      : rawEndAt
  }

  return null
}

export function getCoursePanelLifecycle(
  course: Pick<CoursePanelCourseDateRuleInput, 'startAt' | 'endAt'>,
  effectiveEndsAt: string | null,
  now: Date,
): CoursePanelLifecycleDto {
  if (course.startAt && new Date(course.startAt) > now) return 'notStarted'
  const endsAt = effectiveEndsAt || course.endAt?.trim() || null
  return endsAt && new Date(endsAt) < now ? 'finished' : 'inProgress'
}

export function isCoursePanelEnrollmentCounted(status?: string | null): boolean {
  return !INACTIVE_ENROLLMENT_STATUSES.has(normalizeText(status))
}

export function isCoursePanelEnrollmentRiskEligible(status?: string | null): boolean {
  return RISK_ELIGIBLE_ENROLLMENT_STATUSES.has(normalizeText(status))
}

export function normalizeCoursePanelRiskLevel(value?: string | null): CoursePanelRiskLevelDto {
  return value && COURSE_PANEL_RISK_LEVELS.includes(value as CoursePanelRiskLevelDto)
    ? value as CoursePanelRiskLevelDto
    : 'normal'
}

function activityStatusInput(activity: CoursePanelActivityRuleInput) {
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

export function getCoursePanelWorkflowStatus(
  activity: CoursePanelActivityRuleInput,
): CoursePanelWorkflowStatusDto {
  return WORKFLOW_STATUS_MAP[getStudentActivityWorkflowStatus(activityStatusInput(activity))]
}

function emptySubmissionCounts(): CoursePanelSubmissionCountsDto {
  return {
    completed: 0,
    corrected: 0,
    pendingCorrection: 0,
    pendingSubmission: 0,
    total: 0,
  }
}

function mapSubmission(activity: CoursePanelActivityRuleInput): CoursePanelSubmissionDto {
  return {
    completedAt: activity.completedAt ?? null,
    grade: activity.grade ?? null,
    gradedAt: activity.gradedAt ?? null,
    gradeMax: activity.gradeMax ?? null,
    id: activity.id,
    percentage: activity.percentage ?? null,
    studentId: activity.studentId,
    submittedAt: activity.submittedAt ?? null,
    workflowStatus: getCoursePanelWorkflowStatus(activity),
  }
}

function canonicalText(
  values: Array<string | null | undefined>,
  tieBreaker: (left: string, right: string) => number = (left, right) => (
    left.localeCompare(right, 'pt-BR')
  ),
): string | null {
  const frequencies = new Map<string, number>()

  values.forEach((value) => {
    const candidate = value?.trim()
    if (!candidate) return
    frequencies.set(candidate, (frequencies.get(candidate) ?? 0) + 1)
  })

  return [...frequencies.entries()]
    .sort(([left, leftFrequency], [right, rightFrequency]) => (
      rightFrequency - leftFrequency
      || tieBreaker(left, right)
      || left.localeCompare(right)
    ))[0]?.[0] ?? null
}

function canonicalDueAt(records: CoursePanelActivityRuleInput[]): string | null {
  return canonicalText(records.map((record) => record.dueAt), (left, right) => (
    sortableTimestamp(left) - sortableTimestamp(right)
    || left.localeCompare(right)
  ))
}

function canonicalHidden(records: CoursePanelActivityRuleInput[]): boolean {
  const explicitOverrides = records
    .map((record) => record.visibilityOverrideHidden)
    .filter((value): value is boolean => typeof value === 'boolean')

  // The persisted override is the source of truth, including an explicit
  // "visible" choice. A conflicting legacy group without an override is kept
  // hidden so row order can never accidentally expose it.
  return explicitOverrides.length > 0
    ? explicitOverrides.some(Boolean)
    : records.some((record) => record.hidden)
}

export function buildCoursePanelActivities(
  activityRecords: CoursePanelActivityRuleInput[],
  studentNames: Map<string, string>,
): CoursePanelActivityDto[] {
  const groupedRecords = new Map<string, CoursePanelActivityRuleInput[]>()
  activityRecords.forEach((activity) => {
    groupedRecords.set(activity.moodleActivityId, [
      ...(groupedRecords.get(activity.moodleActivityId) ?? []),
      activity,
    ])
  })

  return [...groupedRecords.entries()].map(([moodleActivityId, records]) => {
    const canonicalId = [...records]
      .map((record) => record.id)
      .sort((left, right) => left.localeCompare(right))[0]
    const canonicalCourseId = [...records]
      .map((record) => record.courseId)
      .sort((left, right) => left.localeCompare(right))[0]
    const canonicalName = canonicalText(records.map((record) => record.name)) ?? moodleActivityId
    const canonicalType = canonicalText(records.map((record) => record.activityType))
    const submissions = records
      .filter((record) => studentNames.has(record.studentId))
      .map(mapSubmission)
      .sort((left, right) => (
        (studentNames.get(left.studentId) ?? '').localeCompare(
          studentNames.get(right.studentId) ?? '',
          'pt-BR',
        )
        || left.studentId.localeCompare(right.studentId)
        || left.id.localeCompare(right.id)
      ))
    const submissionCounts = submissions.reduce<CoursePanelSubmissionCountsDto>(
      (counts, submission) => {
        counts.total += 1
        counts[submission.workflowStatus] += 1
        return counts
      },
      emptySubmissionCounts(),
    )

    return {
      courseId: canonicalCourseId,
      dueAt: canonicalDueAt(records),
      hidden: canonicalHidden(records),
      id: canonicalId,
      isAssignment: ASSIGNMENT_ACTIVITY_TYPES.has(normalizeText(canonicalType)),
      moodleActivityId,
      name: canonicalName,
      submissionCounts,
      submissions,
      type: canonicalType,
    }
  }).sort((left, right) => (
    left.name.localeCompare(right.name, 'pt-BR')
    || left.moodleActivityId.localeCompare(right.moodleActivityId)
    || left.id.localeCompare(right.id)
  ))
}

export function buildCoursePanelStats(input: {
  activities: CoursePanelActivityDto[]
  activityRecords: CoursePanelActivityRuleInput[]
  enrollments: CoursePanelEnrollmentRuleInput[]
  lifecycle: CoursePanelLifecycleDto
  students: CoursePanelStudentRuleInput[]
}): CoursePanelStatsDto {
  const enrolledStudentIds = new Set(
    input.enrollments
      .filter((enrollment) => isCoursePanelEnrollmentCounted(enrollment.enrollmentStatus))
      .map((enrollment) => enrollment.studentId),
  )
  const riskEligibleStudentIds = new Set(
    input.enrollments
      .filter((enrollment) => isCoursePanelEnrollmentRiskEligible(enrollment.enrollmentStatus))
      .map((enrollment) => enrollment.studentId),
  )
  const riskDistribution: CoursePanelStatsDto['riskDistribution'] = {
    atencao: 0,
    critico: 0,
    normal: 0,
    risco: 0,
  }

  if (input.lifecycle === 'inProgress') {
    input.students.forEach((student) => {
      if (!riskEligibleStudentIds.has(student.id)) return
      const riskLevel = normalizeCoursePanelRiskLevel(student.riskLevel)
      if (riskLevel !== 'inativo') riskDistribution[riskLevel] += 1
    })
  }

  const visibleActivityIds = new Set(
    input.activities
      .filter((activity) => !activity.hidden)
      .map((activity) => activity.moodleActivityId),
  )
  const visibleRecords = input.activityRecords.filter((activity) => (
    enrolledStudentIds.has(activity.studentId)
    && visibleActivityIds.has(activity.moodleActivityId)
  ))
  const completedRecords = visibleRecords.filter((activity) => (
    getCoursePanelWorkflowStatus(activity) !== 'pendingSubmission'
  )).length

  return {
    atRiskStudents: riskDistribution.risco + riskDistribution.critico,
    completionRate: visibleRecords.length > 0
      ? Math.round((completedRecords / visibleRecords.length) * 100)
      : 0,
    riskDistribution,
    totalActivities: new Set(visibleRecords.map((activity) => activity.moodleActivityId)).size,
    totalStudents: enrolledStudentIds.size,
  }
}
