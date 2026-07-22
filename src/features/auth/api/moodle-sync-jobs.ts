import type { Course } from '@/features/courses/types';
import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';

import type {
  MoodleRiskRecalculationDto,
  MoodleSyncActiveJobsDto,
  MoodleSyncCourseCountsDto,
  MoodleSyncCourseDto,
  MoodleSyncCoursesDto,
  MoodleSyncEntityDto,
  MoodleSyncJobDto,
  MoodleSyncJobResponseDto,
  MoodleSyncJobStatusDto,
  MoodleSyncJobStepDto,
  MoodleSyncPreferencesDto,
  MoodleSyncStepEntityDto,
} from './contracts/moodle-sync-jobs.contract';
import { mapMoodleSyncCourse } from './mappers/moodle-sync.mapper';

const FUNCTION_NAME = 'moodle-sync-jobs';
const STATUSES = new Set<MoodleSyncJobStatusDto>(['pending', 'processing', 'completed', 'failed', 'cancelled']);
const ENTITIES = new Set<MoodleSyncEntityDto>(['students', 'activities', 'grades']);
const STEP_ENTITIES = new Set<MoodleSyncStepEntityDto>(['courses', 'students', 'activities', 'grades', 'risk']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function hasContractVersion(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.contractVersion === 2;
}

function isCourse(value: unknown): value is MoodleSyncCourseDto {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.moodleCourseId === 'string'
    && typeof value.name === 'string'
    && isNullableString(value.shortName)
    && isNullableString(value.category)
    && isNullableString(value.startsAt)
    && isNullableString(value.endsAt)
    && isNullableString(value.lastSynchronizedAt)
    && isNullableString(value.createdAt)
    && isNullableString(value.updatedAt);
}

function isStep(value: unknown): value is MoodleSyncJobStepDto {
  return isRecord(value)
    && typeof value.entity === 'string'
    && STEP_ENTITIES.has(value.entity as MoodleSyncStepEntityDto)
    && typeof value.status === 'string'
    && STATUSES.has(value.status as MoodleSyncJobStatusDto)
    && isNullableString(value.errorMessage)
    && isNonNegativeInteger(value.processedItems)
    && isNonNegativeInteger(value.recordCount)
    && isNonNegativeInteger(value.totalItems);
}

function isJob(value: unknown): value is MoodleSyncJobDto {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.connectionId === 'string'
    && (value.kind === 'initial' || value.kind === 'incremental')
    && typeof value.status === 'string'
    && STATUSES.has(value.status as MoodleSyncJobStatusDto)
    && Array.isArray(value.courseIds)
    && value.courseIds.every((item) => typeof item === 'string')
    && Array.isArray(value.entities)
    && value.entities.every((item) => typeof item === 'string' && ENTITIES.has(item as MoodleSyncEntityDto))
    && Array.isArray(value.steps)
    && value.steps.every(isStep)
    && isNonNegativeInteger(value.totalItems)
    && isNonNegativeInteger(value.processedItems)
    && isNonNegativeInteger(value.successCount)
    && isNonNegativeInteger(value.errorCount)
    && isNullableString(value.errorMessage)
    && isNullableString(value.startedAt)
    && isNullableString(value.completedAt)
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string';
}

function invalidResponse(): never {
  throw new Error('A API de sincronizacao retornou uma resposta invalida.');
}

function readJobResponse(value: unknown): MoodleSyncJobResponseDto {
  if (!hasContractVersion(value) || typeof value.duplicate !== 'boolean' || !isJob(value.job)) {
    invalidResponse();
  }
  return value as unknown as MoodleSyncJobResponseDto;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  return await invokeEdgeFunction<T>(FUNCTION_NAME, { body, timeoutMs: 60_000 });
}

export async function listAvailableMoodleCourses(connectionId: string): Promise<Course[]> {
  const response = await invoke<MoodleSyncCoursesDto>({ action: 'list_available_courses', connectionId });
  if (!hasContractVersion(response) || !Array.isArray(response.items) || !response.items.every(isCourse)) {
    invalidResponse();
  }
  return response.items.map(mapMoodleSyncCourse);
}

export async function startInitialMoodleSync(
  connectionId: string,
  courseIds: string[],
): Promise<MoodleSyncJobResponseDto> {
  return readJobResponse(await invoke({ action: 'start_initial_sync', connectionId, courseIds }));
}

export async function startCourseMoodleSync(
  connectionId: string,
  courseIds: string[],
  entities: MoodleSyncEntityDto[],
): Promise<MoodleSyncJobResponseDto> {
  return readJobResponse(await invoke({ action: 'start_course_sync', connectionId, courseIds, entities }));
}

export async function getMoodleSyncJob(jobId: string): Promise<MoodleSyncJobDto> {
  return readJobResponse(await invoke({ action: 'get_job', jobId })).job;
}

export async function listActiveMoodleSyncJobs(): Promise<MoodleSyncJobDto[]> {
  const response = await invoke<MoodleSyncActiveJobsDto>({ action: 'list_active_jobs' });
  if (!hasContractVersion(response) || !Array.isArray(response.items) || !response.items.every(isJob)) {
    invalidResponse();
  }
  return response.items;
}

export async function retryMoodleSyncJob(jobId: string): Promise<MoodleSyncJobDto> {
  const response = await invoke<{ contractVersion: 2; job: MoodleSyncJobDto }>({ action: 'retry_job', jobId });
  if (!hasContractVersion(response) || !isJob(response.job)) invalidResponse();
  return response.job;
}

export async function cancelMoodleSyncJob(jobId: string): Promise<MoodleSyncJobDto> {
  const response = await invoke<{ contractVersion: 2; job: MoodleSyncJobDto }>({ action: 'cancel_job', jobId });
  if (!hasContractVersion(response) || !isJob(response.job)) invalidResponse();
  return response.job;
}

export async function fetchMoodleSyncPreferences(connectionId: string): Promise<MoodleSyncPreferencesDto> {
  const response = await invoke<MoodleSyncPreferencesDto>({ action: 'get_preferences', connectionId });
  if (
    !hasContractVersion(response)
    || typeof response.includeEmptyCourses !== 'boolean'
    || typeof response.includeFinished !== 'boolean'
    || !Array.isArray(response.selectedKeys)
    || !response.selectedKeys.every((item) => typeof item === 'string')
  ) {
    invalidResponse();
  }
  return response;
}

export async function saveMoodleSyncPreferences(preferences: {
  connectionId: string;
  includeEmptyCourses: boolean;
  includeFinished: boolean;
  selectedKeys: string[];
}): Promise<MoodleSyncPreferencesDto> {
  const response = await invoke<MoodleSyncPreferencesDto>({ action: 'save_preferences', ...preferences });
  if (!hasContractVersion(response)) invalidResponse();
  return response;
}

export async function fetchMoodleCourseStudentCounts(
  connectionId: string,
  courseIds: string[],
): Promise<Map<string, number>> {
  const response = await invoke<MoodleSyncCourseCountsDto>({
    action: 'get_course_student_counts',
    connectionId,
    courseIds,
  });
  if (
    !hasContractVersion(response)
    || !Array.isArray(response.counts)
    || !response.counts.every((item) => (
      isRecord(item) && typeof item.courseId === 'string' && isNonNegativeInteger(item.studentCount)
    ))
  ) {
    invalidResponse();
  }
  return new Map(response.counts.map((item) => [item.courseId, item.studentCount]));
}

export async function recalculateMoodleRisk(
  connectionId: string,
  courseIds: string[],
): Promise<MoodleRiskRecalculationDto> {
  const response = await invoke<MoodleRiskRecalculationDto>({ action: 'recalculate_risk', connectionId, courseIds });
  if (
    !hasContractVersion(response)
    || !isNonNegativeInteger(response.failedCount)
    || !isNonNegativeInteger(response.updatedCount)
    || typeof response.missingRpc !== 'boolean'
    || typeof response.usedFallback !== 'boolean'
  ) {
    invalidResponse();
  }
  return response;
}

export function isTerminalMoodleSyncStatus(status: MoodleSyncJobStatusDto): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export async function waitForMoodleSyncJob(
  initialJob: MoodleSyncJobDto,
  onProgress?: (job: MoodleSyncJobDto) => void,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<MoodleSyncJobDto> {
  let job = initialJob;
  onProgress?.(job);
  const startedAt = Date.now();
  const intervalMs = options.intervalMs ?? 1_500;
  const timeoutMs = options.timeoutMs ?? 15 * 60_000;

  while (!isTerminalMoodleSyncStatus(job.status)) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error('A sincronizacao continua em segundo plano. Consulte o indicador de atividades para acompanhar.');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    job = await getMoodleSyncJob(job.id);
    onProgress?.(job);
  }
  return job;
}
