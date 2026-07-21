import { ApiError } from '../_shared/http/mod.ts'
import {
  COURSE_PANEL_CONTRACT_VERSION,
  type CoursePanelDto,
  type CoursePanelStudentDto,
  type SetCourseActivityVisibilityDto,
} from './contract.ts'
import type {
  CoursePanelPayload,
  GetCoursePanelPayload,
  SetCourseActivityVisibilityPayload,
} from './payload.ts'
import type {
  CoursePanelEnrollmentRecord,
  CoursePanelRepository,
} from './repository.ts'
import {
  buildCoursePanelActivities,
  buildCoursePanelStats,
  getCoursePanelLifecycle,
  getEffectiveCourseEndDate,
  normalizeCoursePanelRiskLevel,
} from './rules.ts'

export const COURSE_PANEL_VIEW_PERMISSION = 'courses.panel.view'
export const COURSE_ACTIVITY_VISIBILITY_PERMISSION = 'courses.activities.visibility.manage'

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  const validValues = values
    .map((value) => value?.trim() || null)
    .filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value)))
  if (validValues.length === 0) return null
  return validValues.sort((left, right) => Date.parse(right) - Date.parse(left))[0]
}

function mapStudents(enrollments: CoursePanelEnrollmentRecord[]): CoursePanelStudentDto[] {
  const students = new Map<string, CoursePanelStudentDto>()

  enrollments.forEach((enrollment) => {
    if (!enrollment.student || students.has(enrollment.studentId)) return
    const student = enrollment.student
    students.set(enrollment.studentId, {
      avatarUrl: student.avatarUrl,
      email: student.email,
      enrollmentStatus: enrollment.enrollmentStatus ?? null,
      id: student.id,
      lastAccessAt: enrollment.lastAccessAt || student.lastAccessAt || null,
      name: student.name,
      riskLevel: normalizeCoursePanelRiskLevel(student.riskLevel),
    })
  })

  return [...students.values()].sort((left, right) => (
    left.name.localeCompare(right.name, 'pt-BR') || left.id.localeCompare(right.id)
  ))
}

function databaseErrorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : undefined
}

export async function authorizeCoursePanelAction(
  repository: CoursePanelRepository,
  authenticatedUserId: string,
  payload: CoursePanelPayload,
): Promise<boolean> {
  const permission = payload.action === 'get_panel'
    ? COURSE_PANEL_VIEW_PERMISSION
    : COURSE_ACTIVITY_VISIBILITY_PERMISSION
  const [hasPermission, hasCourseAccess] = await Promise.all([
    repository.userHasPermission(authenticatedUserId, permission),
    repository.userCanAccessCourse(authenticatedUserId, payload.courseId),
  ])
  return hasPermission && hasCourseAccess
}

export async function getCoursePanel(
  repository: CoursePanelRepository,
  authenticatedUserId: string,
  payload: GetCoursePanelPayload,
  now = new Date(),
): Promise<CoursePanelDto> {
  const course = await repository.findCourse(payload.courseId)
  if (!course) throw ApiError.notFound('Course not found')

  const [courseDates, enrollments, activityRecords, attendanceEnabled] = await Promise.all([
    repository.listAccessibleCourseDates(authenticatedUserId),
    repository.listEnrollments(payload.courseId),
    repository.listActivities(payload.courseId),
    repository.isAttendanceEnabled(authenticatedUserId, payload.courseId),
  ])
  const scopedCourseDates = courseDates.some((candidate) => candidate.id === course.id)
    ? courseDates
    : [...courseDates, course]
  const effectiveEndsAt = getEffectiveCourseEndDate(course.id, scopedCourseDates)
  const lifecycle = getCoursePanelLifecycle(course, effectiveEndsAt, now)
  const students = mapStudents(enrollments)
  const studentNames = new Map(students.map((student) => [student.id, student.name]))
  const activities = buildCoursePanelActivities(activityRecords, studentNames)
  const stats = buildCoursePanelStats({
    activities,
    activityRecords,
    enrollments,
    lifecycle,
    students: enrollments.flatMap((enrollment) => enrollment.student
      ? [{ id: enrollment.studentId, riskLevel: enrollment.student.riskLevel }]
      : []),
  })

  return {
    activities,
    attendanceEnabled,
    course: {
      category: course.category ?? null,
      effectiveEndsAt,
      endsAt: course.endAt ?? null,
      id: course.id,
      lastSyncedAt: course.lastSyncedAt,
      lifecycle,
      moodleCourseId: course.moodleCourseId,
      name: course.name,
      shortName: course.shortName,
      startsAt: course.startAt ?? null,
    },
    metadata: {
      contractVersion: COURSE_PANEL_CONTRACT_VERSION,
      dataUpdatedAt: latestTimestamp([
        course.lastSyncedAt,
        course.updatedAt,
        ...enrollments.flatMap((enrollment) => [
          enrollment.lastSyncedAt,
          enrollment.student?.updatedAt,
        ]),
        ...activityRecords.map((activity) => activity.updatedAt),
      ]),
      generatedAt: now.toISOString(),
    },
    stats,
    students,
  }
}

export async function setCourseActivityVisibility(
  repository: CoursePanelRepository,
  authenticatedUserId: string,
  payload: SetCourseActivityVisibilityPayload,
  now = new Date(),
): Promise<SetCourseActivityVisibilityDto> {
  try {
    const updatedCount = await repository.setActivityVisibility({
      courseId: payload.courseId,
      hidden: payload.hidden,
      moodleActivityId: payload.moodleActivityId,
      userId: authenticatedUserId,
    })
    return {
      courseId: payload.courseId,
      hidden: payload.hidden,
      metadata: {
        contractVersion: COURSE_PANEL_CONTRACT_VERSION,
        generatedAt: now.toISOString(),
      },
      moodleActivityId: payload.moodleActivityId,
      updatedCount,
    }
  } catch (error) {
    const code = databaseErrorCode(error)
    if (code === '42501') throw ApiError.forbidden('Course access denied')
    if (code === 'P0002') throw ApiError.notFound('Course activity not found')
    if (code === '22023') throw ApiError.unprocessable('Invalid activity visibility command')
    throw error
  }
}

export async function executeCoursePanel(
  repository: CoursePanelRepository,
  authenticatedUserId: string,
  payload: CoursePanelPayload,
): Promise<CoursePanelDto | SetCourseActivityVisibilityDto> {
  switch (payload.action) {
    case 'get_panel':
      return getCoursePanel(repository, authenticatedUserId, payload)
    case 'set_activity_visibility':
      return setCourseActivityVisibility(repository, authenticatedUserId, payload)
  }
}
