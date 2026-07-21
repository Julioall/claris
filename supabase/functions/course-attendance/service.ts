import { ApiError } from '../_shared/http/mod.ts'
import {
  COURSE_ATTENDANCE_CONTRACT_VERSION,
  type CourseAttendanceOverviewDto,
  type CourseAttendanceSheetDto,
  type SaveCourseAttendanceDto,
} from './contract.ts'
import type {
  CourseAttendancePayload,
  GetAttendanceOverviewPayload,
  GetAttendanceSheetPayload,
  SaveAttendanceSheetPayload,
} from './payload.ts'
import type { CourseAttendanceRepository } from './repository.ts'

function databaseErrorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : undefined
}

async function requireCourseAccess(
  repository: CourseAttendanceRepository,
  userId: string,
  courseId: string,
) {
  if (!await repository.userCanAccessCourse(userId, courseId)) {
    throw ApiError.forbidden('Course access denied')
  }
}

export async function getCourseAttendanceOverview(
  repository: CourseAttendanceRepository,
  userId: string,
  payload: GetAttendanceOverviewPayload,
  now = new Date(),
): Promise<CourseAttendanceOverviewDto> {
  await requireCourseAccess(repository, userId, payload.courseId)
  const [dateSummaries, history, students] = await Promise.all([
    repository.listDateSummaries({
      courseId: payload.courseId,
      userId,
    }),
    repository.listHistory({
      courseId: payload.courseId,
      limit: payload.limit,
      offset: payload.offset,
      userId,
    }),
    repository.listStudents(payload.courseId),
  ])
  const hasMore = history.length > payload.limit

  return {
    dateSummaries,
    metadata: {
      contractVersion: COURSE_ATTENDANCE_CONTRACT_VERSION,
      generatedAt: now.toISOString(),
      hasMore,
      limit: payload.limit,
      offset: payload.offset,
    },
    records: history.slice(0, payload.limit).map((record) => ({
      date: record.date,
      id: record.id,
      notes: record.notes,
      status: record.status,
      student: { id: record.studentId, name: record.studentName },
      updatedAt: record.updatedAt,
    })),
    students,
  }
}

export async function getCourseAttendanceSheet(
  repository: CourseAttendanceRepository,
  userId: string,
  payload: GetAttendanceSheetPayload,
  now = new Date(),
): Promise<CourseAttendanceSheetDto> {
  await requireCourseAccess(repository, userId, payload.courseId)
  const entries = await repository.listSheet({
    courseId: payload.courseId,
    date: payload.date,
    userId,
  })

  return {
    courseId: payload.courseId,
    date: payload.date,
    entries,
    metadata: {
      contractVersion: COURSE_ATTENDANCE_CONTRACT_VERSION,
      generatedAt: now.toISOString(),
    },
  }
}

export async function saveCourseAttendanceSheet(
  repository: CourseAttendanceRepository,
  userId: string,
  payload: SaveAttendanceSheetPayload,
  now = new Date(),
): Promise<SaveCourseAttendanceDto> {
  await requireCourseAccess(repository, userId, payload.courseId)

  try {
    const savedCount = await repository.saveSheet({
      courseId: payload.courseId,
      date: payload.date,
      entries: payload.entries,
      userId,
    })
    return {
      courseId: payload.courseId,
      date: payload.date,
      metadata: {
        contractVersion: COURSE_ATTENDANCE_CONTRACT_VERSION,
        generatedAt: now.toISOString(),
      },
      savedCount,
    }
  } catch (error) {
    const code = databaseErrorCode(error)
    if (code === '42501') throw ApiError.forbidden('Course access denied')
    if (code === 'P0001') throw ApiError.conflict('Attendance is disabled for this course')
    if (code === 'P0002' || code === '22023') {
      throw ApiError.unprocessable('Attendance sheet is invalid')
    }
    throw error
  }
}

export async function executeCourseAttendance(
  repository: CourseAttendanceRepository,
  userId: string,
  payload: CourseAttendancePayload,
): Promise<CourseAttendanceOverviewDto | CourseAttendanceSheetDto | SaveCourseAttendanceDto> {
  switch (payload.action) {
    case 'get_overview':
      return getCourseAttendanceOverview(repository, userId, payload)
    case 'get_sheet':
      return getCourseAttendanceSheet(repository, userId, payload)
    case 'save_sheet':
      return saveCourseAttendanceSheet(repository, userId, payload)
  }
}
