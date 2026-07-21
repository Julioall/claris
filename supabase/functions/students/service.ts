import { ApiError } from '../_shared/http/mod.ts'
import {
  STUDENTS_CONTRACT_VERSION,
  type StudentEnrollmentStatusDto,
  type StudentHistoryDto,
  type StudentProfileDto,
  type StudentsPageDto,
} from './contract.ts'
import type {
  GetStudentHistoryPayload,
  GetStudentProfilePayload,
  ListStudentsPayload,
  StudentsPayload,
} from './payload.ts'
import type {
  StudentProfileRecord,
  StudentsRepository,
} from './repository.ts'
import {
  buildStudentHistory,
  buildStudentProfileCourses,
  normalizeStudentRiskLevel,
} from './rules.ts'

export const STUDENTS_VIEW_PERMISSION = 'students.view'
const HISTORY_LIMIT = 60

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  const timestamps = values
    .map((value) => value?.trim() || null)
    .filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value)))
  if (timestamps.length === 0) return null
  return timestamps.sort((left, right) => Date.parse(right) - Date.parse(left))[0]
}

function normalizeEnrollmentStatus(value: string): StudentEnrollmentStatusDto {
  switch (value.trim().toLowerCase()) {
    case 'suspenso':
      return 'suspenso'
    case 'concluido':
      return 'concluido'
    case 'inativo':
      return 'inativo'
    default:
      return 'ativo'
  }
}

async function findAccessibleStudent(
  repository: StudentsRepository,
  authenticatedUserId: string,
  studentId: string,
): Promise<StudentProfileRecord> {
  const hasAccess = await repository.userCanAccessStudent(authenticatedUserId, studentId)
  if (!hasAccess) throw ApiError.notFound('Student not found')
  const student = await repository.findStudent(studentId)
  if (!student) throw ApiError.notFound('Student not found')
  return student
}

export async function authorizeStudentsAction(
  repository: StudentsRepository,
  authenticatedUserId: string,
  _payload: StudentsPayload,
): Promise<boolean> {
  return repository.userHasPermission(authenticatedUserId, STUDENTS_VIEW_PERMISSION)
}

export async function listStudents(
  repository: StudentsRepository,
  authenticatedUserId: string,
  payload: ListStudentsPayload,
  now = new Date(),
): Promise<StudentsPageDto> {
  const offset = (payload.page - 1) * payload.pageSize
  const page = await repository.listStudentsPage({
    courseId: payload.filters.courseId,
    enrollmentStatus: payload.filters.enrollmentStatus,
    limit: payload.pageSize,
    offset,
    riskLevel: payload.filters.riskLevel,
    search: payload.filters.search,
    userId: authenticatedUserId,
  })
  return {
    items: page.items.map((student) => ({
      avatarUrl: student.avatarUrl,
      email: student.email,
      enrollmentStatus: normalizeEnrollmentStatus(student.enrollmentStatus),
      id: student.id,
      lastAccessAt: student.lastAccessAt,
      name: student.name,
      riskLevel: normalizeStudentRiskLevel(student.riskLevel),
    })),
    metadata: {
      contractVersion: STUDENTS_CONTRACT_VERSION,
      generatedAt: now.toISOString(),
    },
    page: payload.page,
    pageSize: payload.pageSize,
    totalCount: page.totalCount,
    totalPages: Math.ceil(page.totalCount / payload.pageSize),
  }
}

export async function getStudentProfile(
  repository: StudentsRepository,
  authenticatedUserId: string,
  payload: GetStudentProfilePayload,
  now = new Date(),
): Promise<StudentProfileDto> {
  const student = await findAccessibleStudent(repository, authenticatedUserId, payload.studentId)
  const courseIds = await repository.listStudentCourseIds(authenticatedUserId, payload.studentId)
  const [courses, grades, activities] = await Promise.all([
    repository.listCourses(courseIds),
    repository.listGrades(payload.studentId, courseIds),
    repository.listActivities({
      courseIds,
      includeHidden: true,
      studentId: payload.studentId,
    }),
  ])

  return {
    courses: buildStudentProfileCourses({ activities, courses, grades }),
    metadata: {
      contractVersion: STUDENTS_CONTRACT_VERSION,
      dataUpdatedAt: latestTimestamp([
        student.updatedAt,
        ...courses.map((course) => course.updatedAt),
        ...grades.flatMap((grade) => [grade.lastSyncedAt, grade.updatedAt]),
        ...activities.map((activity) => activity.updatedAt),
      ]),
      generatedAt: now.toISOString(),
    },
    student: {
      avatarUrl: student.avatarUrl,
      city: student.city,
      createdAt: student.createdAt,
      email: student.email,
      id: student.id,
      lastAccessAt: student.lastAccessAt,
      mobilePhone: student.mobilePhone,
      moodleUserId: student.moodleUserId,
      name: student.name,
      phone: student.phone,
      phoneNumber: student.phoneNumber,
      riskLevel: normalizeStudentRiskLevel(student.riskLevel),
      riskReasons: student.riskReasons,
      tags: student.tags,
      updatedAt: student.updatedAt,
    },
  }
}

export async function getStudentHistory(
  repository: StudentsRepository,
  authenticatedUserId: string,
  payload: GetStudentHistoryPayload,
  now = new Date(),
): Promise<StudentHistoryDto> {
  await findAccessibleStudent(repository, authenticatedUserId, payload.studentId)
  const courseIds = await repository.listStudentCourseIds(authenticatedUserId, payload.studentId)
  const [courses, activities, snapshots] = await Promise.all([
    repository.listCourses(courseIds),
    repository.listActivities({
      courseIds,
      includeHidden: false,
      studentId: payload.studentId,
    }),
    repository.listSnapshots(payload.studentId, courseIds, HISTORY_LIMIT),
  ])
  const items = buildStudentHistory({ activities, courses, now, snapshots })
  return {
    items,
    metadata: {
      contractVersion: STUDENTS_CONTRACT_VERSION,
      dataUpdatedAt: latestTimestamp([
        ...items.map((snapshot) => snapshot.synchronizedAt),
        ...activities.map((activity) => activity.updatedAt),
      ]),
      generatedAt: now.toISOString(),
    },
  }
}

export async function executeStudents(
  repository: StudentsRepository,
  authenticatedUserId: string,
  payload: StudentsPayload,
): Promise<StudentsPageDto | StudentProfileDto | StudentHistoryDto> {
  switch (payload.action) {
    case 'list_students':
      return listStudents(repository, authenticatedUserId, payload)
    case 'get_profile':
      return getStudentProfile(repository, authenticatedUserId, payload)
    case 'get_history':
      return getStudentHistory(repository, authenticatedUserId, payload)
  }
}
