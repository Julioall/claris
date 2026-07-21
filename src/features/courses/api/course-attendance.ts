import {
  ApiClientError,
  invokeEdgeFunction,
} from '@/integrations/http/edge-function-client';

import {
  ATTENDANCE_STATUSES,
  COURSE_ATTENDANCE_CONTRACT_VERSION,
  type AttendanceStatusDto,
  type CourseAttendanceOverviewDto,
  type CourseAttendanceSheetDto,
  type SaveCourseAttendanceDto,
} from './contracts/course-attendance.contract';

const COURSE_ATTENDANCE_TIMEOUT_MS = 20_000;

export interface SaveCourseAttendanceInput {
  courseId: string;
  date: string;
  entries: Array<{
    notes: string | null;
    status: AttendanceStatusDto;
    studentId: string;
  }>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isStatus(value: unknown): value is AttendanceStatusDto {
  return typeof value === 'string'
    && ATTENDANCE_STATUSES.includes(value as AttendanceStatusDto);
}

function hasVersionedMetadata(value: unknown): boolean {
  const metadata = asRecord(value);
  return Boolean(
    metadata
    && metadata.contractVersion === COURSE_ATTENDANCE_CONTRACT_VERSION
    && typeof metadata.generatedAt === 'string',
  );
}

function isStudent(value: unknown): boolean {
  const student = asRecord(value);
  return Boolean(
    student
    && typeof student.id === 'string'
    && typeof student.name === 'string'
    && isNullableString(student.email),
  );
}

function isHistoryRecord(value: unknown): boolean {
  const record = asRecord(value);
  const student = asRecord(record?.student);
  return Boolean(
    record
    && typeof record.id === 'string'
    && typeof record.date === 'string'
    && isStatus(record.status)
    && isNullableString(record.notes)
    && isNullableString(record.updatedAt)
    && student
    && typeof student.id === 'string'
    && typeof student.name === 'string',
  );
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() + 1 === month
    && parsed.getUTCDate() === day;
}

function isDateSummary(value: unknown): boolean {
  const summary = asRecord(value);
  if (!(
    summary
    && isIsoDate(summary.date)
    && isNonNegativeSafeInteger(summary.presente)
    && isNonNegativeSafeInteger(summary.ausente)
    && isNonNegativeSafeInteger(summary.justificado)
    && isNonNegativeSafeInteger(summary.total)
  )) return false;

  return summary.total === summary.presente + summary.ausente + summary.justificado;
}

function invalidResponse(): never {
  throw new ApiClientError({
    code: 'invalid_response',
    message: 'A API retornou dados de presenca invalidos.',
  });
}

function parseOverview(value: unknown): CourseAttendanceOverviewDto {
  const overview = asRecord(value);
  const metadata = asRecord(overview?.metadata);
  if (!(
    overview
    && Array.isArray(overview.dateSummaries)
    && overview.dateSummaries.every(isDateSummary)
    && Array.isArray(overview.records)
    && overview.records.every(isHistoryRecord)
    && Array.isArray(overview.students)
    && overview.students.every(isStudent)
    && hasVersionedMetadata(metadata)
    && typeof metadata?.hasMore === 'boolean'
    && Number.isInteger(metadata.limit)
    && Number.isInteger(metadata.offset)
  )) invalidResponse();
  return overview as unknown as CourseAttendanceOverviewDto;
}

function parseSheet(value: unknown): CourseAttendanceSheetDto {
  const sheet = asRecord(value);
  if (!(
    sheet
    && typeof sheet.courseId === 'string'
    && typeof sheet.date === 'string'
    && Array.isArray(sheet.entries)
    && sheet.entries.every((rawEntry) => {
      const entry = asRecord(rawEntry);
      return Boolean(
        entry
        && typeof entry.studentId === 'string'
        && isStatus(entry.status)
        && isNullableString(entry.notes)
        && isNullableString(entry.updatedAt),
      );
    })
    && hasVersionedMetadata(sheet.metadata)
  )) invalidResponse();
  return sheet as unknown as CourseAttendanceSheetDto;
}

function parseSaveResult(value: unknown): SaveCourseAttendanceDto {
  const result = asRecord(value);
  if (!(
    result
    && typeof result.courseId === 'string'
    && typeof result.date === 'string'
    && Number.isInteger(result.savedCount)
    && (result.savedCount as number) >= 0
    && hasVersionedMetadata(result.metadata)
  )) invalidResponse();
  return result as unknown as SaveCourseAttendanceDto;
}

export async function getCourseAttendanceOverview(
  courseId: string,
  signal?: AbortSignal,
): Promise<CourseAttendanceOverviewDto> {
  const result = await invokeEdgeFunction<unknown>('course-attendance', {
    auth: 'required',
    body: { action: 'get_overview', courseId },
    signal,
    timeoutMs: COURSE_ATTENDANCE_TIMEOUT_MS,
  });
  return parseOverview(result);
}

export async function getCourseAttendanceSheet(
  courseId: string,
  date: string,
  signal?: AbortSignal,
): Promise<CourseAttendanceSheetDto> {
  const result = await invokeEdgeFunction<unknown>('course-attendance', {
    auth: 'required',
    body: { action: 'get_sheet', courseId, date },
    signal,
    timeoutMs: COURSE_ATTENDANCE_TIMEOUT_MS,
  });
  return parseSheet(result);
}

export async function saveCourseAttendance(
  input: SaveCourseAttendanceInput,
  signal?: AbortSignal,
): Promise<SaveCourseAttendanceDto> {
  const result = await invokeEdgeFunction<unknown>('course-attendance', {
    auth: 'required',
    body: {
      action: 'save_sheet',
      courseId: input.courseId,
      date: input.date,
      entries: input.entries,
    },
    signal,
    timeoutMs: COURSE_ATTENDANCE_TIMEOUT_MS,
  });
  return parseSaveResult(result);
}
