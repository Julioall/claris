import {
  cancelAdminBackgroundJobDto,
  getAdminBackgroundJobDto,
  listAdminBackgroundJobDtos,
  retryAdminBackgroundJobDto,
} from '@/features/background-jobs/api/background-jobs.client';
import type {
  BackgroundJobDto,
  BackgroundJobEventDto,
  BackgroundJobItemDto,
} from '@/features/background-jobs/api/contracts/background-jobs.contract';

export type AdminBackgroundJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface AdminBackgroundJobUser {
  email: string | null;
  id: string;
  full_name: string;
}

export interface AdminBackgroundJobRow {
  id: string;
  user_id: string;
  course_id: string | null;
  job_type: string;
  source: string;
  source_table: string | null;
  source_record_id: string | null;
  title: string;
  description: string | null;
  status: AdminBackgroundJobStatus;
  total_items: number;
  processed_items: number;
  success_count: number;
  error_count: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
  user: AdminBackgroundJobUser | null;
  can_cancel: boolean;
  can_retry: boolean;
}

export interface AdminBackgroundJobItemRow {
  id: string;
  job_id: string;
  user_id: string;
  source_table: string | null;
  source_record_id: string | null;
  item_key: string | null;
  label: string;
  status: string;
  progress_current: number;
  progress_total: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

export interface AdminBackgroundJobEventRow {
  id: string;
  job_id: string;
  user_id: string;
  job_item_id: string | null;
  event_type: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  metadata: unknown;
  created_at: string;
}

export interface AdminBackgroundJobDetails {
  job: AdminBackgroundJobRow;
  items: AdminBackgroundJobItemRow[];
  events: AdminBackgroundJobEventRow[];
}

export interface AdminBackgroundJobFilters {
  status?: AdminBackgroundJobStatus | 'all';
  source?: string | 'all';
  jobType?: string | 'all';
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedAdminBackgroundJobs {
  items: AdminBackgroundJobRow[];
  totalCount: number;
}

function mapJob(job: BackgroundJobDto): AdminBackgroundJobRow {
  return {
    id: job.id,
    user_id: job.userId,
    course_id: job.courseId,
    job_type: job.jobType,
    source: job.source,
    source_table: job.sourceTable,
    source_record_id: job.sourceRecordId,
    title: job.title,
    description: job.description,
    status: job.status,
    total_items: job.totalItems,
    processed_items: job.processedItems,
    success_count: job.successCount,
    error_count: job.errorCount,
    error_message: job.errorMessage,
    started_at: job.startedAt,
    completed_at: job.completedAt,
    metadata: job.metadata,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    user: job.user ? {
      id: job.user.id,
      full_name: job.user.fullName,
      email: job.user.email,
    } : null,
    can_cancel: job.canCancel,
    can_retry: job.canRetry,
  };
}

function mapItem(item: BackgroundJobItemDto): AdminBackgroundJobItemRow {
  return {
    id: item.id,
    job_id: item.jobId,
    user_id: item.userId,
    source_table: item.sourceTable,
    source_record_id: item.sourceRecordId,
    item_key: item.itemKey,
    label: item.label,
    status: item.status,
    progress_current: item.progressCurrent,
    progress_total: item.progressTotal,
    started_at: item.startedAt,
    completed_at: item.completedAt,
    error_message: item.errorMessage,
    metadata: item.metadata,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function mapEvent(event: BackgroundJobEventDto): AdminBackgroundJobEventRow {
  return {
    id: event.id,
    job_id: event.jobId,
    user_id: event.userId,
    job_item_id: event.jobItemId,
    event_type: event.eventType,
    level: event.level,
    message: event.message,
    metadata: event.metadata,
    created_at: event.createdAt,
  };
}

export function canAdminRetryBackgroundJob(job: Pick<AdminBackgroundJobRow, 'can_retry'>): boolean {
  return job.can_retry;
}

export function canAdminCancelBackgroundJob(job: Pick<AdminBackgroundJobRow, 'can_cancel'>): boolean {
  return job.can_cancel;
}

export async function listAdminBackgroundJobs(
  filters: AdminBackgroundJobFilters = {},
): Promise<PaginatedAdminBackgroundJobs> {
  const page = Math.max(filters.page ?? 1, 1);
  const pageSize = Math.min(Math.max(filters.pageSize ?? 30, 1), 100);
  const response = await listAdminBackgroundJobDtos({
    filters: {
      ...(filters.status && filters.status !== 'all' ? { status: filters.status } : {}),
      ...(filters.source && filters.source !== 'all' ? { source: filters.source } : {}),
      ...(filters.jobType && filters.jobType !== 'all' ? { jobType: filters.jobType } : {}),
      ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
    },
    page,
    pageSize,
  });
  return { items: response.items.map(mapJob), totalCount: response.totalCount };
}

export async function getAdminBackgroundJobDetails(jobId: string): Promise<AdminBackgroundJobDetails> {
  const response = await getAdminBackgroundJobDto(jobId);
  return {
    job: mapJob(response.job),
    items: response.items.map(mapItem),
    events: response.events.map(mapEvent),
  };
}

export async function retryAdminBackgroundJob(job: AdminBackgroundJobRow): Promise<void> {
  await retryAdminBackgroundJobDto(job.id);
}

export async function cancelAdminBackgroundJob(job: AdminBackgroundJobRow): Promise<void> {
  await cancelAdminBackgroundJobDto(job.id);
}
