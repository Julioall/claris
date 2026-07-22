import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';

import type {
  ActiveBackgroundJobsDto,
  AdminBackgroundJobDetailsDto,
  AdminBackgroundJobsPageDto,
  BackgroundJobDto,
  BackgroundJobEventDto,
  BackgroundJobItemDto,
  BackgroundJobStatusDto,
  BackgroundJobUserDto,
} from './contracts/background-jobs.contract';

const FUNCTION_NAME = 'background-jobs';
const STATUSES = new Set<BackgroundJobStatusDto>(['pending', 'processing', 'completed', 'failed', 'cancelled']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function count(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function user(value: unknown): value is BackgroundJobUserDto | null {
  return value === null || (
    isRecord(value)
    && typeof value.id === 'string'
    && typeof value.fullName === 'string'
    && nullableString(value.email)
  );
}

function job(value: unknown): value is BackgroundJobDto {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.userId === 'string'
    && typeof value.jobType === 'string'
    && typeof value.source === 'string'
    && typeof value.title === 'string'
    && typeof value.status === 'string'
    && STATUSES.has(value.status as BackgroundJobStatusDto)
    && typeof value.canCancel === 'boolean'
    && typeof value.canRetry === 'boolean'
    && count(value.totalItems)
    && count(value.processedItems)
    && count(value.successCount)
    && count(value.errorCount)
    && nullableString(value.courseId)
    && nullableString(value.sourceTable)
    && nullableString(value.sourceRecordId)
    && nullableString(value.description)
    && nullableString(value.errorMessage)
    && nullableString(value.startedAt)
    && nullableString(value.completedAt)
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
    && user(value.user);
}

function item(value: unknown): value is BackgroundJobItemDto {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.jobId === 'string'
    && typeof value.userId === 'string'
    && typeof value.label === 'string'
    && typeof value.status === 'string'
    && nullableString(value.sourceTable)
    && nullableString(value.sourceRecordId)
    && nullableString(value.itemKey)
    && nullableString(value.startedAt)
    && nullableString(value.completedAt)
    && nullableString(value.errorMessage)
    && count(value.progressCurrent)
    && count(value.progressTotal)
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string';
}

function event(value: unknown): value is BackgroundJobEventDto {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.jobId === 'string'
    && typeof value.userId === 'string'
    && nullableString(value.jobItemId)
    && typeof value.eventType === 'string'
    && (value.level === 'info' || value.level === 'warning' || value.level === 'error')
    && typeof value.message === 'string'
    && typeof value.createdAt === 'string';
}

function envelope(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.contractVersion === 1;
}

function invalid(): never {
  throw new Error('A API de jobs retornou uma resposta invalida.');
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  return await invokeEdgeFunction<T>(FUNCTION_NAME, { body });
}

export async function listActiveBackgroundJobDtos(): Promise<BackgroundJobDto[]> {
  const response = await invoke<ActiveBackgroundJobsDto>({ action: 'list_active' });
  if (!envelope(response) || !Array.isArray(response.items) || !response.items.every(job)) invalid();
  return response.items;
}

export async function listAdminBackgroundJobDtos(input: {
  filters: { jobType?: string; search?: string; source?: string; status?: BackgroundJobStatusDto };
  page: number;
  pageSize: number;
}): Promise<AdminBackgroundJobsPageDto> {
  const response = await invoke<AdminBackgroundJobsPageDto>({ action: 'admin_list', ...input });
  if (
    !envelope(response)
    || !Array.isArray(response.items)
    || !response.items.every(job)
    || !count(response.totalCount)
    || !count(response.totalPages)
    || !count(response.page)
    || !count(response.pageSize)
  ) invalid();
  return response;
}

export async function getAdminBackgroundJobDto(jobId: string): Promise<AdminBackgroundJobDetailsDto> {
  const response = await invoke<AdminBackgroundJobDetailsDto>({ action: 'admin_get', jobId });
  if (
    !envelope(response)
    || !job(response.job)
    || !Array.isArray(response.items)
    || !response.items.every(item)
    || !Array.isArray(response.events)
    || !response.events.every(event)
  ) invalid();
  return response;
}

async function command(action: 'admin_retry' | 'admin_cancel', jobId: string): Promise<BackgroundJobDto> {
  const response = await invoke<{ contractVersion: 1; job: BackgroundJobDto }>({ action, jobId });
  if (!envelope(response) || !job(response.job)) invalid();
  return response.job;
}

export function retryAdminBackgroundJobDto(jobId: string): Promise<BackgroundJobDto> {
  return command('admin_retry', jobId);
}

export function cancelAdminBackgroundJobDto(jobId: string): Promise<BackgroundJobDto> {
  return command('admin_cancel', jobId);
}
