import {
  ApiClientError,
  invokeEdgeFunction,
} from '@/integrations/http/edge-function-client';

import {
  ACADEMIC_REPORTS_CONTRACT_VERSION,
  ACADEMIC_REPORT_COURSE_LIFECYCLES,
  ACADEMIC_REPORT_PENDING_STATUSES,
  type AcademicGradesReportDto,
  type AcademicPendingActivitiesReportDto,
  type AcademicReportCourseDto,
  type AcademicReportCoursesDto,
  type AcademicReportMetadataDto,
} from './contracts/academic-reports.contract';

const ACADEMIC_REPORT_COURSES_TIMEOUT_MS = 20_000;
const ACADEMIC_REPORT_GENERATION_TIMEOUT_MS = 60_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isMetadata(value: unknown): value is AcademicReportMetadataDto {
  const metadata = asRecord(value);
  return Boolean(
    metadata
    && metadata.contractVersion === ACADEMIC_REPORTS_CONTRACT_VERSION
    && typeof metadata.generatedAt === 'string',
  );
}

function isCourse(value: unknown): value is AcademicReportCourseDto {
  const course = asRecord(value);
  return Boolean(
    course
    && typeof course.id === 'string'
    && typeof course.name === 'string'
    && isNullableString(course.shortName)
    && isNullableString(course.category)
    && isNullableString(course.startsAt)
    && isNullableString(course.endsAt)
    && isNullableString(course.effectiveEndsAt)
    && typeof course.lifecycleStatus === 'string'
    && ACADEMIC_REPORT_COURSE_LIFECYCLES.includes(
      course.lifecycleStatus as AcademicReportCourseDto['lifecycleStatus'],
    ),
  );
}

function invalidResponse(): never {
  throw new ApiClientError({
    code: 'invalid_response',
    message: 'A API retornou dados de relatorio invalidos.',
  });
}

function parseCourses(value: unknown): AcademicReportCoursesDto {
  const response = asRecord(value);
  if (!(
    response
    && Array.isArray(response.items)
    && response.items.every(isCourse)
    && isMetadata(response.metadata)
  )) invalidResponse();
  const courseIds = new Set((response.items as AcademicReportCourseDto[]).map((course) => course.id));
  if (courseIds.size !== response.items.length) invalidResponse();
  return response as unknown as AcademicReportCoursesDto;
}

function parseGradesReport(value: unknown): AcademicGradesReportDto {
  const response = asRecord(value);
  if (!(
    response
    && Array.isArray(response.units)
    && response.units.length > 0
    && response.units.every(isCourse)
    && Array.isArray(response.students)
    && isMetadata(response.metadata)
  )) invalidResponse();

  const unitIds = new Set((response.units as AcademicReportCourseDto[]).map((unit) => unit.id));
  if (unitIds.size !== response.units.length) invalidResponse();
  const studentIds = new Set<string>();
  const validStudents = response.students.every((value) => {
    const student = asRecord(value);
    if (!(
      student
      && typeof student.studentId === 'string'
      && typeof student.name === 'string'
      && isNullableString(student.lastAccessAt)
      && typeof student.isSuspended === 'boolean'
      && Array.isArray(student.grades)
      && !studentIds.has(student.studentId)
    )) return false;
    studentIds.add(student.studentId);

    const seenCourseIds = new Set<string>();
    return student.grades.every((gradeValue) => {
      const grade = asRecord(gradeValue);
      if (!(
        grade
        && typeof grade.courseId === 'string'
        && unitIds.has(grade.courseId)
        && isNullableFiniteNumber(grade.gradeRaw)
        && isNullableFiniteNumber(grade.gradePercentage)
        && !seenCourseIds.has(grade.courseId)
      )) return false;
      seenCourseIds.add(grade.courseId);
      return true;
    });
  });
  if (!validStudents) invalidResponse();
  return response as unknown as AcademicGradesReportDto;
}

function parsePendingReport(value: unknown): AcademicPendingActivitiesReportDto {
  const response = asRecord(value);
  if (!(
    response
    && Array.isArray(response.students)
    && Array.isArray(response.details)
    && isMetadata(response.metadata)
  )) invalidResponse();

  const students = new Map<string, { pendingCorrectionCount: number; pendingSubmissionCount: number }>();
  const validStudents = response.students.every((value) => {
    const student = asRecord(value);
    if (!(
      student
      && typeof student.studentId === 'string'
      && typeof student.name === 'string'
      && isNullableString(student.lastAccessAt)
      && Number.isInteger(student.totalCount)
      && (student.totalCount as number) > 0
      && Number.isInteger(student.pendingSubmissionCount)
      && (student.pendingSubmissionCount as number) >= 0
      && Number.isInteger(student.pendingCorrectionCount)
      && (student.pendingCorrectionCount as number) >= 0
      && student.totalCount === (
        (student.pendingSubmissionCount as number) + (student.pendingCorrectionCount as number)
      )
      && !students.has(student.studentId)
    )) return false;
    students.set(student.studentId, {
      pendingCorrectionCount: student.pendingCorrectionCount as number,
      pendingSubmissionCount: student.pendingSubmissionCount as number,
    });
    return true;
  });

  const detailCounts = new Map<string, { pendingCorrectionCount: number; pendingSubmissionCount: number }>();
  const validDetails = response.details.every((value) => {
    const detail = asRecord(value);
    if (!(
      detail
      && typeof detail.studentId === 'string'
      && students.has(detail.studentId)
      && typeof detail.courseId === 'string'
      && typeof detail.unitName === 'string'
      && typeof detail.activityName === 'string'
      && typeof detail.activityType === 'string'
      && typeof detail.workflowStatus === 'string'
      && ACADEMIC_REPORT_PENDING_STATUSES.includes(
        detail.workflowStatus as AcademicPendingActivitiesReportDto['details'][number]['workflowStatus'],
      )
    )) return false;
    const counts = detailCounts.get(detail.studentId) ?? {
      pendingCorrectionCount: 0,
      pendingSubmissionCount: 0,
    };
    counts[detail.workflowStatus === 'pendingCorrection'
      ? 'pendingCorrectionCount'
      : 'pendingSubmissionCount'] += 1;
    detailCounts.set(detail.studentId, counts);
    return true;
  });

  if (!validStudents || !validDetails || [...students.entries()].some(([studentId, expected]) => {
    const actual = detailCounts.get(studentId);
    return !actual
      || actual.pendingCorrectionCount !== expected.pendingCorrectionCount
      || actual.pendingSubmissionCount !== expected.pendingSubmissionCount;
  })) invalidResponse();

  return response as unknown as AcademicPendingActivitiesReportDto;
}

export async function listAcademicReportCourses(
  signal?: AbortSignal,
): Promise<AcademicReportCourseDto[]> {
  const response = await invokeEdgeFunction<unknown>('academic-reports', {
    auth: 'required',
    body: { action: 'list_courses' },
    signal,
    timeoutMs: ACADEMIC_REPORT_COURSES_TIMEOUT_MS,
  });
  return parseCourses(response).items;
}

export async function getAcademicGradesReport(
  courseIds: string[],
  includeSuspendedStudents: boolean,
  signal?: AbortSignal,
): Promise<AcademicGradesReportDto> {
  const response = await invokeEdgeFunction<unknown>('academic-reports', {
    auth: 'required',
    body: {
      action: 'get_grades_report',
      courseIds,
      includeSuspendedStudents,
    },
    signal,
    timeoutMs: ACADEMIC_REPORT_GENERATION_TIMEOUT_MS,
  });
  return parseGradesReport(response);
}

export async function getAcademicPendingActivitiesReport(
  courseIds: string[],
  signal?: AbortSignal,
): Promise<AcademicPendingActivitiesReportDto> {
  const response = await invokeEdgeFunction<unknown>('academic-reports', {
    auth: 'required',
    body: {
      action: 'get_pending_activities_report',
      courseIds,
    },
    signal,
    timeoutMs: ACADEMIC_REPORT_GENERATION_TIMEOUT_MS,
  });
  return parsePendingReport(response);
}
