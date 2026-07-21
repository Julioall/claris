import { ApiError } from '../_shared/http/mod.ts'
import {
  ACADEMIC_REPORTS_CONTRACT_VERSION,
  type AcademicGradesReportDto,
  type AcademicPendingActivitiesReportDto,
  type AcademicReportCoursesDto,
  type AcademicReportResponseDto,
} from './contract.ts'
import type { AcademicReportsPayload } from './payload.ts'
import type { AcademicReportsRepository } from './repository.ts'
import {
  buildAcademicGradesReportStudents,
  buildAcademicPendingActivitiesReport,
  mapAcademicReportCourses,
} from './rules.ts'

export const ACADEMIC_REPORTS_VIEW_PERMISSION = 'reports.view'

function metadata(now: Date) {
  return {
    contractVersion: ACADEMIC_REPORTS_CONTRACT_VERSION,
    generatedAt: now.toISOString(),
  }
}

function ensureRequestedCoursesWereLoaded(
  courseIds: string[],
  courses: Array<{ id: string }>,
) {
  const loadedIds = new Set(courses.map((course) => course.id))
  if (courseIds.some((courseId) => !loadedIds.has(courseId))) {
    throw ApiError.notFound('Report course not found')
  }
}

export async function authorizeAcademicReportsAction(
  repository: AcademicReportsRepository,
  authenticatedUserId: string,
  payload: AcademicReportsPayload,
): Promise<boolean> {
  if (payload.action === 'list_courses') {
    return repository.userHasPermission(authenticatedUserId, ACADEMIC_REPORTS_VIEW_PERMISSION)
  }

  const [hasPermission, hasCourseScope] = await Promise.all([
    repository.userHasPermission(authenticatedUserId, ACADEMIC_REPORTS_VIEW_PERMISSION),
    repository.hasTutorCourseScope(authenticatedUserId, payload.courseIds),
  ])
  return hasPermission && hasCourseScope
}

export async function listAcademicReportCourses(
  repository: AcademicReportsRepository,
  authenticatedUserId: string,
  now = new Date(),
): Promise<AcademicReportCoursesDto> {
  const courses = await repository.listTutorCourses(authenticatedUserId)
  return {
    items: mapAcademicReportCourses(courses, now, 'name'),
    metadata: metadata(now),
  }
}

export async function getAcademicGradesReport(
  repository: AcademicReportsRepository,
  payload: Extract<AcademicReportsPayload, { action: 'get_grades_report' }>,
  now = new Date(),
): Promise<AcademicGradesReportDto> {
  const [courses, enrollments, grades] = await Promise.all([
    repository.listCourses(payload.courseIds),
    repository.listEnrollments(payload.courseIds),
    repository.listCourseGrades(payload.courseIds),
  ])
  ensureRequestedCoursesWereLoaded(payload.courseIds, courses)
  const units = mapAcademicReportCourses(courses, now, 'start')

  return {
    metadata: metadata(now),
    students: buildAcademicGradesReportStudents(
      units,
      enrollments,
      grades,
      payload.includeSuspendedStudents,
    ),
    units,
  }
}

export async function getAcademicPendingActivitiesReport(
  repository: AcademicReportsRepository,
  payload: Extract<AcademicReportsPayload, { action: 'get_pending_activities_report' }>,
  now = new Date(),
): Promise<AcademicPendingActivitiesReportDto> {
  const [courses, enrollments, activities] = await Promise.all([
    repository.listCourses(payload.courseIds),
    repository.listEnrollments(payload.courseIds),
    repository.listActivities(payload.courseIds),
  ])
  ensureRequestedCoursesWereLoaded(payload.courseIds, courses)
  const report = buildAcademicPendingActivitiesReport({
    activities,
    courses,
    enrollments,
    now,
  })

  return {
    ...report,
    metadata: metadata(now),
  }
}

export async function executeAcademicReportsAction(
  repository: AcademicReportsRepository,
  authenticatedUserId: string,
  payload: AcademicReportsPayload,
  options: { now?: Date } = {},
): Promise<AcademicReportResponseDto> {
  const now = options.now ?? new Date()
  switch (payload.action) {
    case 'list_courses':
      return listAcademicReportCourses(repository, authenticatedUserId, now)
    case 'get_grades_report':
      return getAcademicGradesReport(repository, payload, now)
    case 'get_pending_activities_report':
      return getAcademicPendingActivitiesReport(repository, payload, now)
  }
}
