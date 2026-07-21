import {
  DASHBOARD_RISK_LEVELS,
  DASHBOARD_SUMMARY_CONTRACT_VERSION,
  DASHBOARD_SUMMARY_TIME_ZONE,
  type DashboardActivityFeedItemDto,
  type DashboardCriticalStudentDto,
  type DashboardReviewActivityDto,
  type DashboardRiskLevelDto,
  type DashboardSummaryDto,
} from './contract.ts'
import type { DashboardSummaryPayload } from './payload.ts'
import type {
  DashboardActivityRecord,
  DashboardCourseRecord,
  DashboardFeedRecord,
  DashboardStudentRecord,
  DashboardSummaryRepository,
} from './repository.ts'
import {
  countNewAtRiskStudents,
  getActiveDashboardEnrollmentScope,
  getDashboardPeriod,
  isDashboardActivityInScope,
  isDashboardActivityPendingCorrection,
  isDashboardActivityPendingSubmission,
  listOngoingDashboardCourseIds,
} from './rules.ts'

const CRITICAL_STUDENT_LIMIT = 3
const REVIEW_ACTIVITY_LIMIT = 6
const FEED_LIMIT = 20
const RISK_ORDER: Record<DashboardRiskLevelDto, number> = {
  critico: 0,
  risco: 1,
  atencao: 2,
  normal: 3,
  inativo: 4,
}

function riskLevel(value?: DashboardRiskLevelDto | null): DashboardRiskLevelDto {
  return value && DASHBOARD_RISK_LEVELS.includes(value) ? value : 'normal'
}

function optional(value?: string | null): string | undefined {
  return value || undefined
}

function emptySummary(
  payload: DashboardSummaryPayload,
  now: Date,
  appliedCourseCount: number,
  dataUpdatedAt: string | null,
): DashboardSummaryDto {
  const period = getDashboardPeriod(now, payload.week)
  return {
    activitiesToReview: [],
    activityFeed: [],
    criticalStudents: [],
    indicators: {
      activeNormalStudents: 0,
      activitiesToReview: 0,
      newAtRiskThisWeek: 0,
      pendingCorrectionAssignments: 0,
      pendingSubmissionAssignments: 0,
      studentsAtRisk: 0,
      todayEvents: 0,
      todayTasks: 0,
    },
    metadata: {
      appliedCourseCount,
      contractVersion: DASHBOARD_SUMMARY_CONTRACT_VERSION,
      courseId: payload.courseId ?? null,
      dataUpdatedAt,
      generatedAt: now.toISOString(),
      timeZone: DASHBOARD_SUMMARY_TIME_ZONE,
      week: payload.week,
      weekEndsAt: period.weekEndsAt,
      weekStartsAt: period.weekStartsAt,
    },
  }
}

function mapCriticalStudents(students: DashboardStudentRecord[]): DashboardCriticalStudentDto[] {
  return students
    .filter((student) => ['risco', 'critico'].includes(riskLevel(student.riskLevel)))
    .sort((left, right) => (
      RISK_ORDER[riskLevel(left.riskLevel)] - RISK_ORDER[riskLevel(right.riskLevel)]
      || String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? ''))
      || left.name.localeCompare(right.name)
    ))
    .slice(0, CRITICAL_STUDENT_LIMIT)
    .map((student) => ({
      avatarUrl: optional(student.avatarUrl),
      id: student.id,
      lastAccessAt: optional(student.lastAccessAt),
      name: student.name,
      riskLevel: riskLevel(student.riskLevel),
      riskReasons: student.riskReasons ?? [],
      updatedAt: optional(student.updatedAt),
    }))
}

function mapReviewActivities(
  activities: DashboardActivityRecord[],
  students: Map<string, DashboardStudentRecord>,
  courses: Map<string, DashboardCourseRecord>,
): DashboardReviewActivityDto[] {
  return activities
    .sort((left, right) => (
      String(left.dueAt ?? '9999').localeCompare(String(right.dueAt ?? '9999'))
      || String(left.submittedAt ?? '9999').localeCompare(String(right.submittedAt ?? '9999'))
      || left.id.localeCompare(right.id)
    ))
    .slice(0, REVIEW_ACTIVITY_LIMIT)
    .map((activity) => {
      const student = students.get(activity.studentId)
      const course = courses.get(activity.courseId)
      return {
        course: {
          id: activity.courseId,
          name: course?.name ?? 'Curso',
          shortName: optional(course?.shortName),
        },
        courseId: activity.courseId,
        dueAt: optional(activity.dueAt),
        id: activity.id,
        name: activity.name,
        student: {
          id: activity.studentId,
          name: student?.name ?? 'Aluno sem nome',
          riskLevel: riskLevel(student?.riskLevel),
        },
        studentId: activity.studentId,
        submittedAt: optional(activity.submittedAt),
      }
    })
}

function mapFeed(
  feed: DashboardFeedRecord[],
  students: Map<string, DashboardStudentRecord>,
  generatedAt: string,
): DashboardActivityFeedItemDto[] {
  return feed.slice(0, FEED_LIMIT).map((item) => {
    const student = item.studentId ? students.get(item.studentId) : undefined
    return {
      courseId: optional(item.courseId),
      description: optional(item.description),
      eventType: item.eventType,
      id: item.id,
      metadata: item.metadata,
      occurredAt: item.occurredAt ?? generatedAt,
      student: student ? { id: student.id, name: student.name } : undefined,
      studentId: optional(item.studentId),
      title: item.title,
    }
  })
}

export async function getDashboardSummary(
  repository: DashboardSummaryRepository,
  authenticatedUserId: string,
  payload: DashboardSummaryPayload,
  options: { now?: Date } = {},
): Promise<DashboardSummaryDto> {
  const now = options.now ?? new Date()
  const followedCourseIds = await repository.listTutorCourseIds(authenticatedUserId)
  const followedCourses = await repository.listCourses(followedCourseIds)
  const ongoingCourseIdSet = new Set(listOngoingDashboardCourseIds(followedCourses, now))
  const courseIds = payload.courseId
    ? (ongoingCourseIdSet.has(payload.courseId) ? [payload.courseId] : [])
    : [...ongoingCourseIdSet]

  if (courseIds.length === 0) return emptySummary(payload, now, 0, null)

  const period = getDashboardPeriod(now, payload.week)
  const enrollments = await repository.listEnrollments(courseIds)
  const activeScope = getActiveDashboardEnrollmentScope(enrollments)
  const studentIds = [...activeScope.studentIds]
  const riskWindowEnd = payload.week === 'current' && now < new Date(period.weekEndsAt)
    ? now.toISOString()
    : period.weekEndsAt

  const [
    students,
    activities,
    riskTransitions,
    todayEvents,
    todayTasks,
    feed,
    dataUpdatedAt,
  ] = await Promise.all([
    repository.listStudents(studentIds),
    repository.listActivities(courseIds),
    repository.listRiskTransitions({
      endsAt: riskWindowEnd,
      startsAt: period.weekStartsAt,
      studentIds,
    }),
    repository.countEvents({
      endsAt: period.todayEndsAt,
      startsAt: period.todayStartsAt,
      userId: authenticatedUserId,
    }),
    repository.countTasks({
      endsAt: period.todayEndsAt,
      startsAt: period.todayStartsAt,
      userId: authenticatedUserId,
    }),
    repository.listFeed({
      courseFilter: payload.courseId,
      courseIds,
      studentIds,
      userId: authenticatedUserId,
    }),
    repository.getDataUpdatedAt(courseIds),
  ])

  const studentsById = new Map(students.map((student) => [student.id, student]))
  const coursesById = new Map(followedCourses.map((course) => [course.id, course]))
  const scopedActivities = activities.filter((activity) => (
    isDashboardActivityInScope(activity, activeScope.enrollmentKeys)
  ))
  const pendingCorrections = scopedActivities.filter(isDashboardActivityPendingCorrection)
  const pendingSubmissions = scopedActivities.filter((activity) => (
    isDashboardActivityPendingSubmission(activity, now)
  ))
  const criticalStudents = students.filter((student) => (
    ['risco', 'critico'].includes(riskLevel(student.riskLevel))
  ))

  return {
    activitiesToReview: mapReviewActivities(pendingCorrections, studentsById, coursesById),
    activityFeed: mapFeed(feed, studentsById, now.toISOString()),
    criticalStudents: mapCriticalStudents(criticalStudents),
    indicators: {
      activeNormalStudents: students.filter((student) => riskLevel(student.riskLevel) === 'normal').length,
      activitiesToReview: pendingCorrections.length,
      newAtRiskThisWeek: countNewAtRiskStudents(riskTransitions, activeScope.studentIds),
      pendingCorrectionAssignments: pendingCorrections.length,
      pendingSubmissionAssignments: pendingSubmissions.length,
      studentsAtRisk: criticalStudents.length,
      todayEvents,
      todayTasks,
    },
    metadata: {
      appliedCourseCount: courseIds.length,
      contractVersion: DASHBOARD_SUMMARY_CONTRACT_VERSION,
      courseId: payload.courseId ?? null,
      dataUpdatedAt,
      generatedAt: now.toISOString(),
      timeZone: DASHBOARD_SUMMARY_TIME_ZONE,
      week: payload.week,
      weekEndsAt: period.weekEndsAt,
      weekStartsAt: period.weekStartsAt,
    },
  }
}
