import {
  ApiClientError,
  invokeEdgeFunction,
} from '@/integrations/http/edge-function-client';

import type { CourseWithStats } from '../types';
import {
  COURSE_ASSOCIATION_ROLES,
  COURSE_CATALOG_CONTRACT_VERSION,
  COURSE_LIFECYCLE_STATUSES,
  type CourseAssociationRoleDto,
  type CourseCatalogCommandAction,
  type CourseCatalogCommandDto,
  type CourseCatalogDto,
  type CourseLifecycleStatusDto,
} from './contracts/course-catalog.contract';
import { mapCourseCatalogItem } from './mappers/course-catalog.mapper';

const COURSES_CATALOG_TIMEOUT_MS = 20_000;
const COURSE_COMMAND_BATCH_SIZE = 200;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isCatalogItem(value: unknown): boolean {
  const item = asRecord(value);
  return Boolean(
    item
    && typeof item.id === 'string'
    && typeof item.moodleCourseId === 'string'
    && typeof item.name === 'string'
    && isNullableString(item.shortName)
    && isNullableString(item.category)
    && isNullableString(item.startsAt)
    && isNullableString(item.endsAt)
    && isNullableString(item.effectiveEndsAt)
    && isNullableString(item.lastSynchronizedAt)
    && isNullableString(item.createdAt)
    && isNullableString(item.updatedAt)
    && Number.isInteger(item.studentCount)
    && (item.studentCount as number) >= 0
    && Number.isInteger(item.atRiskStudentCount)
    && (item.atRiskStudentCount as number) >= 0
    && typeof item.isFollowing === 'boolean'
    && typeof item.isIgnored === 'boolean'
    && typeof item.isAttendanceEnabled === 'boolean'
    && typeof item.lifecycleStatus === 'string'
    && COURSE_LIFECYCLE_STATUSES.includes(item.lifecycleStatus as CourseLifecycleStatusDto)
    && Array.isArray(item.studentIds)
    && item.studentIds.every((studentId) => typeof studentId === 'string'),
  );
}

function invalidResponse(): never {
  throw new ApiClientError({
    code: 'invalid_response',
    message: 'A API retornou um catalogo de cursos invalido.',
  });
}

function parseCatalog(value: unknown): CourseCatalogDto {
  const catalog = asRecord(value);
  const metadata = asRecord(catalog?.metadata);
  if (!(
    catalog
    && Array.isArray(catalog.items)
    && catalog.items.every(isCatalogItem)
    && metadata
    && metadata.contractVersion === COURSE_CATALOG_CONTRACT_VERSION
    && typeof metadata.generatedAt === 'string'
  )) invalidResponse();
  return catalog as unknown as CourseCatalogDto;
}

function parseCommand(value: unknown, action: CourseCatalogCommandAction): CourseCatalogCommandDto {
  const result = asRecord(value);
  if (!(
    result
    && result.action === action
    && result.contractVersion === COURSE_CATALOG_CONTRACT_VERSION
    && Number.isInteger(result.affectedCourseCount)
    && (result.affectedCourseCount as number) >= 0
  )) invalidResponse();
  return result as unknown as CourseCatalogCommandDto;
}

async function executeCommandInSequentialBatches(
  action: CourseCatalogCommandAction,
  courseIds: string[],
  commandState: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<CourseCatalogCommandDto> {
  let affectedCourseCount = 0;

  // Each request is atomic on the backend. Batches are intentionally sequential:
  // after a failure no later chunk is sent, and callers only update cache after
  // this function resolves every chunk successfully.
  for (let offset = 0; offset < courseIds.length; offset += COURSE_COMMAND_BATCH_SIZE) {
    const response = await invokeEdgeFunction<unknown>('courses-catalog', {
      auth: 'required',
      body: {
        action,
        courseIds: courseIds.slice(offset, offset + COURSE_COMMAND_BATCH_SIZE),
        ...commandState,
      },
      signal,
      timeoutMs: COURSES_CATALOG_TIMEOUT_MS,
    });
    const command = parseCommand(response, action);
    affectedCourseCount += command.affectedCourseCount;
  }

  if (!Number.isSafeInteger(affectedCourseCount)) invalidResponse();
  return {
    action,
    affectedCourseCount,
    contractVersion: COURSE_CATALOG_CONTRACT_VERSION,
  };
}

export async function listCatalogCourses(
  signal?: AbortSignal,
): Promise<CourseWithStats[]> {
  const response = await invokeEdgeFunction<unknown>('courses-catalog', {
    auth: 'required',
    body: { action: 'get_catalog' },
    signal,
    timeoutMs: COURSES_CATALOG_TIMEOUT_MS,
  });
  return parseCatalog(response).items.map(mapCourseCatalogItem);
}

export async function setCourseAssociationRole(
  courseIds: string[],
  role: CourseAssociationRoleDto,
  signal?: AbortSignal,
): Promise<CourseCatalogCommandDto> {
  if (!COURSE_ASSOCIATION_ROLES.includes(role)) invalidResponse();
  return executeCommandInSequentialBatches(
    'set_association_role',
    courseIds,
    { role },
    signal,
  );
}

export async function setCoursesIgnored(
  courseIds: string[],
  ignored: boolean,
  signal?: AbortSignal,
): Promise<CourseCatalogCommandDto> {
  return executeCommandInSequentialBatches(
    'set_ignored',
    courseIds,
    { ignored },
    signal,
  );
}

export async function setCourseAttendanceEnabled(
  courseIds: string[],
  enabled: boolean,
  signal?: AbortSignal,
): Promise<CourseCatalogCommandDto> {
  return executeCommandInSequentialBatches(
    'set_attendance_enabled',
    courseIds,
    { enabled },
    signal,
  );
}
