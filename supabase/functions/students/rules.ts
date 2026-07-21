import {
  getStudentActivityWorkflowStatus,
  isStudentActivityPendingSubmission,
  isStudentActivityWeightedInGradebook,
  type StudentActivityStatusLike,
} from '../_shared/domain/student-activity-status.ts'
import type {
  StudentActivityWorkflowStatusDto,
  StudentHistorySnapshotDto,
  StudentProfileCourseDto,
  StudentRiskLevelDto,
} from './contract.ts'

export interface StudentCourseRuleInput {
  endAt: string | null
  id: string
  name: string
  shortName: string | null
  startAt: string | null
}

export interface StudentGradeRuleInput {
  courseId: string
  formatted: string | null
  id: string
  lastSyncedAt: string | null
  letter: string | null
  maximum: number | null
  percentage: number | null
  raw: number | null
}

export interface StudentActivityRuleInput {
  activityType: string | null
  completedAt: string | null
  courseId: string
  dueAt: string | null
  grade: number | null
  gradeMaximum: number | null
  gradedAt: string | null
  hidden: boolean
  id: string
  moodleActivityId: string
  name: string
  percentage: number | null
  status: string | null
  submittedAt: string | null
}

export interface StudentSnapshotRuleInput {
  courseId: string
  createdAt: string
  daysSinceAccess: number | null
  enrollmentStatus: string
  id: string
  lastAccessAt: string | null
  overdueActivities: number
  pendingActivities: number
  riskLevel: string | null
  synchronizedAt: string
}

const RISK_LEVELS = new Set<StudentRiskLevelDto>([
  'normal',
  'atencao',
  'risco',
  'critico',
  'inativo',
])

const WORKFLOW_PRIORITY: Record<StudentActivityWorkflowStatusDto, number> = {
  pendingCorrection: 0,
  pendingSubmission: 1,
  corrected: 2,
  completed: 3,
}

function toStatusInput(activity: StudentActivityRuleInput): StudentActivityStatusLike {
  return {
    activity_type: activity.activityType,
    completed_at: activity.completedAt,
    grade: activity.grade,
    grade_max: activity.gradeMaximum,
    graded_at: activity.gradedAt,
    percentage: activity.percentage,
    status: activity.status,
    submitted_at: activity.submittedAt,
  }
}

function toTimeOrNull(value: string | null | undefined): number | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function mapWorkflowStatus(activity: StudentActivityRuleInput): StudentActivityWorkflowStatusDto {
  switch (getStudentActivityWorkflowStatus(toStatusInput(activity))) {
    case 'pending_submission':
      return 'pendingSubmission'
    case 'pending_correction':
      return 'pendingCorrection'
    case 'corrected':
      return 'corrected'
    case 'completed':
      return 'completed'
  }
}

export function normalizeStudentRiskLevel(value: string | null | undefined): StudentRiskLevelDto {
  const normalized = value?.trim().toLowerCase() as StudentRiskLevelDto | undefined
  return normalized && RISK_LEVELS.has(normalized) ? normalized : 'normal'
}

export function buildStudentProfileCourses(input: {
  activities: StudentActivityRuleInput[]
  courses: StudentCourseRuleInput[]
  grades: StudentGradeRuleInput[]
}): StudentProfileCourseDto[] {
  const courseById = new Map(input.courses.map((course) => [course.id, course]))
  const latestGradeByCourse = new Map<string, StudentGradeRuleInput>()

  input.grades.forEach((grade) => {
    const current = latestGradeByCourse.get(grade.courseId)
    const currentTime = toTimeOrNull(current?.lastSyncedAt) ?? Number.NEGATIVE_INFINITY
    const candidateTime = toTimeOrNull(grade.lastSyncedAt) ?? Number.NEGATIVE_INFINITY
    if (!current || candidateTime > currentTime || (
      candidateTime === currentTime && grade.id.localeCompare(current.id) > 0
    )) latestGradeByCourse.set(grade.courseId, grade)
  })

  const activitiesByCourse = new Map<string, StudentActivityRuleInput[]>()
  input.activities.forEach((activity) => {
    if (!isStudentActivityWeightedInGradebook(toStatusInput(activity))) return
    const activities = activitiesByCourse.get(activity.courseId) ?? []
    activities.push(activity)
    activitiesByCourse.set(activity.courseId, activities)
  })

  const sectionIds = new Set([
    ...latestGradeByCourse.keys(),
    ...activitiesByCourse.keys(),
  ])

  return [...sectionIds].map((courseId): StudentProfileCourseDto => {
    const course = courseById.get(courseId)
    const grade = latestGradeByCourse.get(courseId)
    const activities = (activitiesByCourse.get(courseId) ?? [])
      .map((activity) => ({
        dueAt: activity.dueAt,
        grade: activity.grade,
        gradeMaximum: activity.gradeMaximum,
        hidden: activity.hidden,
        id: activity.id,
        moodleActivityId: activity.moodleActivityId,
        name: activity.name,
        percentage: activity.percentage,
        type: activity.activityType,
        workflowStatus: mapWorkflowStatus(activity),
      }))
      .sort((left, right) => (
        WORKFLOW_PRIORITY[left.workflowStatus] - WORKFLOW_PRIORITY[right.workflowStatus]
        || (toTimeOrNull(left.dueAt) ?? Number.POSITIVE_INFINITY)
          - (toTimeOrNull(right.dueAt) ?? Number.POSITIVE_INFINITY)
        || left.name.localeCompare(right.name, 'pt-BR')
        || left.id.localeCompare(right.id)
      ))

    return {
      activities,
      grade: grade
        ? {
          formatted: grade.formatted,
          letter: grade.letter,
          maximum: grade.maximum,
          percentage: grade.percentage,
          raw: grade.raw,
          synchronizedAt: grade.lastSyncedAt,
        }
        : null,
      id: courseId,
      name: course?.name ?? 'Curso sem nome',
      shortName: course?.shortName ?? null,
    }
  }).sort((left, right) => (
    left.name.localeCompare(right.name, 'pt-BR') || left.id.localeCompare(right.id)
  ))
}

export function buildStudentHistory(input: {
  activities: StudentActivityRuleInput[]
  courses: StudentCourseRuleInput[]
  now?: Date
  snapshots: StudentSnapshotRuleInput[]
}): StudentHistorySnapshotDto[] {
  const now = input.now ?? new Date()
  const courseById = new Map(input.courses.map((course) => [course.id, course]))
  const countsByCourse = new Map<string, { overdue: number; pending: number }>()

  input.activities.forEach((activity) => {
    const statusInput = toStatusInput(activity)
    if (!isStudentActivityWeightedInGradebook(statusInput)) return
    if (!isStudentActivityPendingSubmission(statusInput)) return

    const counts = countsByCourse.get(activity.courseId) ?? { overdue: 0, pending: 0 }
    counts.pending += 1
    const dueAt = toTimeOrNull(activity.dueAt)
    if (dueAt !== null && dueAt < now.getTime()) counts.overdue += 1
    countsByCourse.set(activity.courseId, counts)
  })

  return input.snapshots.map((snapshot): StudentHistorySnapshotDto => {
    const course = courseById.get(snapshot.courseId)
    const resolvedCounts = countsByCourse.get(snapshot.courseId)
    return {
      course: course
        ? {
          endsAt: course.endAt,
          id: course.id,
          name: course.name,
          shortName: course.shortName,
          startsAt: course.startAt,
        }
        : null,
      courseId: snapshot.courseId,
      createdAt: snapshot.createdAt,
      daysSinceAccess: snapshot.daysSinceAccess,
      enrollmentStatus: snapshot.enrollmentStatus,
      id: snapshot.id,
      lastAccessAt: snapshot.lastAccessAt,
      overdueActivities: resolvedCounts?.overdue ?? snapshot.overdueActivities,
      pendingActivities: resolvedCounts?.pending ?? snapshot.pendingActivities,
      riskLevel: normalizeStudentRiskLevel(snapshot.riskLevel),
      synchronizedAt: snapshot.synchronizedAt,
    }
  }).sort((left, right) => {
    const leftEndsAt = toTimeOrNull(left.course?.endsAt)
    const rightEndsAt = toTimeOrNull(right.course?.endsAt)
    const leftPast = leftEndsAt !== null && leftEndsAt < now.getTime()
    const rightPast = rightEndsAt !== null && rightEndsAt < now.getTime()
    if (leftPast !== rightPast) return leftPast ? 1 : -1

    const leftStartsAt = toTimeOrNull(left.course?.startsAt) ?? Number.NEGATIVE_INFINITY
    const rightStartsAt = toTimeOrNull(right.course?.startsAt) ?? Number.NEGATIVE_INFINITY
    if (rightStartsAt !== leftStartsAt) return rightStartsAt - leftStartsAt

    const leftSynchronizedAt = toTimeOrNull(left.synchronizedAt) ?? Number.NEGATIVE_INFINITY
    const rightSynchronizedAt = toTimeOrNull(right.synchronizedAt) ?? Number.NEGATIVE_INFINITY
    return rightSynchronizedAt - leftSynchronizedAt || left.id.localeCompare(right.id)
  })
}
