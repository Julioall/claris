import {
  ApiClientError,
  invokeEdgeFunction,
} from '@/integrations/http/edge-function-client';

import {
  STUDENT_ACTIVITY_WORKFLOW_STATUSES,
  STUDENT_ENROLLMENT_STATUSES,
  STUDENT_RISK_LEVELS,
  STUDENTS_CONTRACT_VERSION,
  type StudentActivityWorkflowStatusDto,
  type StudentEnrollmentStatusDto,
  type StudentHistoryDto,
  type StudentProfileDto,
  type StudentRiskLevelDto,
  type StudentsPageDto,
} from './contracts/students.contract';
import {
  mapStudentHistory,
  mapStudentProfile,
  mapStudentsPage,
} from './mappers/student.mapper';
import type {
  StudentHistory,
  StudentListPage,
  StudentProfile,
} from '../types';

const STUDENTS_TIMEOUT_MS = 20_000;

export interface ListStudentsInput {
  courseId?: string;
  enrollmentStatus?: StudentEnrollmentStatusDto;
  page?: number;
  pageSize?: number;
  riskLevel?: StudentRiskLevelDto;
  search?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isRiskLevel(value: unknown): value is StudentRiskLevelDto {
  return typeof value === 'string'
    && STUDENT_RISK_LEVELS.includes(value as StudentRiskLevelDto);
}

function isEnrollmentStatus(value: unknown): value is StudentEnrollmentStatusDto {
  return typeof value === 'string'
    && STUDENT_ENROLLMENT_STATUSES.includes(value as StudentEnrollmentStatusDto);
}

function isWorkflowStatus(value: unknown): value is StudentActivityWorkflowStatusDto {
  return typeof value === 'string'
    && STUDENT_ACTIVITY_WORKFLOW_STATUSES.includes(value as StudentActivityWorkflowStatusDto);
}

function isMetadata(value: unknown, withDataTimestamp: boolean): boolean {
  const metadata = asRecord(value);
  return Boolean(
    metadata
    && metadata.contractVersion === STUDENTS_CONTRACT_VERSION
    && typeof metadata.generatedAt === 'string'
    && (!withDataTimestamp || isNullableString(metadata.dataUpdatedAt)),
  );
}

function isListItem(value: unknown): boolean {
  const student = asRecord(value);
  return Boolean(
    student
    && typeof student.id === 'string'
    && typeof student.name === 'string'
    && isNullableString(student.email)
    && isNullableString(student.avatarUrl)
    && isNullableString(student.lastAccessAt)
    && isRiskLevel(student.riskLevel)
    && isEnrollmentStatus(student.enrollmentStatus),
  );
}

function isProfileIdentity(value: unknown): boolean {
  const student = asRecord(value);
  return Boolean(
    student
    && typeof student.id === 'string'
    && typeof student.moodleUserId === 'string'
    && typeof student.name === 'string'
    && isNullableString(student.email)
    && isNullableString(student.city)
    && isNullableString(student.phone)
    && isNullableString(student.phoneNumber)
    && isNullableString(student.mobilePhone)
    && isNullableString(student.avatarUrl)
    && isRiskLevel(student.riskLevel)
    && Array.isArray(student.riskReasons)
    && student.riskReasons.every((reason) => typeof reason === 'string')
    && Array.isArray(student.tags)
    && student.tags.every((tag) => typeof tag === 'string')
    && isNullableString(student.lastAccessAt)
    && isNullableString(student.createdAt)
    && isNullableString(student.updatedAt),
  );
}

function isGrade(value: unknown): boolean {
  if (value === null) return true;
  const grade = asRecord(value);
  return Boolean(
    grade
    && isNullableNumber(grade.raw)
    && isNullableNumber(grade.maximum)
    && isNullableNumber(grade.percentage)
    && isNullableString(grade.formatted)
    && isNullableString(grade.letter)
    && isNullableString(grade.synchronizedAt),
  );
}

function isActivity(value: unknown): boolean {
  const activity = asRecord(value);
  return Boolean(
    activity
    && typeof activity.id === 'string'
    && typeof activity.moodleActivityId === 'string'
    && typeof activity.name === 'string'
    && isNullableString(activity.type)
    && isNullableNumber(activity.grade)
    && isNullableNumber(activity.gradeMaximum)
    && isNullableNumber(activity.percentage)
    && isNullableString(activity.dueAt)
    && typeof activity.hidden === 'boolean'
    && isWorkflowStatus(activity.workflowStatus),
  );
}

function isProfileCourse(value: unknown): boolean {
  const course = asRecord(value);
  return Boolean(
    course
    && typeof course.id === 'string'
    && typeof course.name === 'string'
    && isNullableString(course.shortName)
    && isGrade(course.grade)
    && Array.isArray(course.activities)
    && course.activities.every(isActivity),
  );
}

function isHistoryCourse(value: unknown): boolean {
  if (value === null) return true;
  const course = asRecord(value);
  return Boolean(
    course
    && typeof course.id === 'string'
    && typeof course.name === 'string'
    && isNullableString(course.shortName)
    && isNullableString(course.startsAt)
    && isNullableString(course.endsAt),
  );
}

function isHistorySnapshot(value: unknown): boolean {
  const snapshot = asRecord(value);
  return Boolean(
    snapshot
    && typeof snapshot.id === 'string'
    && typeof snapshot.courseId === 'string'
    && isHistoryCourse(snapshot.course)
    && typeof snapshot.synchronizedAt === 'string'
    && isRiskLevel(snapshot.riskLevel)
    && typeof snapshot.enrollmentStatus === 'string'
    && isNullableString(snapshot.lastAccessAt)
    && (snapshot.daysSinceAccess === null || isNonNegativeInteger(snapshot.daysSinceAccess))
    && isNonNegativeInteger(snapshot.pendingActivities)
    && isNonNegativeInteger(snapshot.overdueActivities)
    && typeof snapshot.createdAt === 'string',
  );
}

function invalidResponse(subject: string): never {
  throw new ApiClientError({
    code: 'invalid_response',
    message: `A API retornou ${subject} invalido.`,
  });
}

function parseStudentsPage(value: unknown): StudentsPageDto {
  const page = asRecord(value);
  if (!(
    page
    && Array.isArray(page.items)
    && page.items.every(isListItem)
    && Number.isInteger(page.page)
    && (page.page as number) >= 1
    && Number.isInteger(page.pageSize)
    && (page.pageSize as number) >= 1
    && (page.pageSize as number) <= 100
    && isNonNegativeInteger(page.totalCount)
    && isNonNegativeInteger(page.totalPages)
    && page.totalPages === Math.ceil((page.totalCount as number) / (page.pageSize as number))
    && isMetadata(page.metadata, false)
  )) invalidResponse('uma pagina de alunos');
  return page as unknown as StudentsPageDto;
}

function parseStudentProfile(value: unknown): StudentProfileDto {
  const profile = asRecord(value);
  if (!(
    profile
    && isProfileIdentity(profile.student)
    && Array.isArray(profile.courses)
    && profile.courses.every(isProfileCourse)
    && isMetadata(profile.metadata, true)
  )) invalidResponse('um perfil de aluno');
  return profile as unknown as StudentProfileDto;
}

function parseStudentHistory(value: unknown): StudentHistoryDto {
  const history = asRecord(value);
  if (!(
    history
    && Array.isArray(history.items)
    && history.items.every(isHistorySnapshot)
    && isMetadata(history.metadata, true)
  )) invalidResponse('um historico de aluno');
  return history as unknown as StudentHistoryDto;
}

export async function listStudents(
  input: ListStudentsInput = {},
  signal?: AbortSignal,
): Promise<StudentListPage> {
  const response = await invokeEdgeFunction<unknown>('students', {
    auth: 'required',
    body: {
      action: 'list_students',
      filters: {
        ...(input.courseId ? { courseId: input.courseId } : {}),
        ...(input.enrollmentStatus ? { enrollmentStatus: input.enrollmentStatus } : {}),
        ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
        ...(input.search?.trim() ? { search: input.search.trim() } : {}),
      },
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 30,
    },
    signal,
    timeoutMs: STUDENTS_TIMEOUT_MS,
  });
  return mapStudentsPage(parseStudentsPage(response));
}

export async function getStudentProfile(
  studentId: string,
  signal?: AbortSignal,
): Promise<StudentProfile> {
  const response = await invokeEdgeFunction<unknown>('students', {
    auth: 'required',
    body: { action: 'get_profile', studentId },
    signal,
    timeoutMs: STUDENTS_TIMEOUT_MS,
  });
  return mapStudentProfile(parseStudentProfile(response));
}

export async function getStudentHistory(
  studentId: string,
  signal?: AbortSignal,
): Promise<StudentHistory> {
  const response = await invokeEdgeFunction<unknown>('students', {
    auth: 'required',
    body: { action: 'get_history', studentId },
    signal,
    timeoutMs: STUDENTS_TIMEOUT_MS,
  });
  return mapStudentHistory(parseStudentHistory(response));
}
