import { ApiError } from '../_shared/http/mod.ts'
import type { BackgroundJobRecord } from '../_shared/domain/background-jobs/repository.ts'
import {
  BACKGROUND_JOBS_CONTRACT_VERSION,
  type ActiveBackgroundJobsDto,
  type AdminBackgroundJobDetailsDto,
  type AdminBackgroundJobsPageDto,
  type BackgroundJobCommandDto,
  type BackgroundJobDto,
  type BackgroundJobsResponseDto,
  type BackgroundJobUserDto,
} from './contract.ts'
import type { BackgroundJobsPayload } from './payload.ts'
import type { BackgroundJobsRepository } from './repository.ts'

function capabilities(job: BackgroundJobRecord): { canCancel: boolean; canRetry: boolean } {
  if (job.source_table === 'scheduled_messages') {
    return {
      canCancel: job.status === 'pending',
      canRetry: job.status === 'failed' || job.status === 'cancelled',
    }
  }
  if (job.job_type === 'moodle_sync' && job.source === 'sync') {
    return {
      canCancel: job.status === 'pending' || job.status === 'processing',
      canRetry: job.status === 'failed' || job.status === 'cancelled',
    }
  }
  return { canCancel: false, canRetry: false }
}

export function mapBackgroundJob(
  job: BackgroundJobRecord,
  user: BackgroundJobUserDto | null,
): BackgroundJobDto {
  return {
    ...capabilities(job),
    completedAt: job.completed_at,
    courseId: job.course_id,
    createdAt: job.created_at,
    description: job.description,
    errorCount: job.error_count,
    errorMessage: job.error_message,
    id: job.id,
    jobType: job.job_type,
    metadata: job.metadata,
    processedItems: job.processed_items,
    source: job.source,
    sourceRecordId: job.source_record_id,
    sourceTable: job.source_table,
    startedAt: job.started_at,
    status: job.status,
    successCount: job.success_count,
    title: job.title,
    totalItems: job.total_items,
    updatedAt: job.updated_at,
    user,
    userId: job.user_id,
  }
}

export async function authorizeBackgroundJobs(
  repository: BackgroundJobsRepository,
  actorId: string,
  payload: BackgroundJobsPayload,
): Promise<boolean> {
  return payload.action === 'list_active' || await repository.isAdmin(actorId)
}

export async function executeBackgroundJobs(
  repository: BackgroundJobsRepository,
  actorId: string,
  payload: BackgroundJobsPayload,
): Promise<BackgroundJobsResponseDto> {
  switch (payload.action) {
    case 'list_active':
      return {
        contractVersion: BACKGROUND_JOBS_CONTRACT_VERSION,
        items: (await repository.listActive(actorId)).map((job) => mapBackgroundJob(job, null)),
      } satisfies ActiveBackgroundJobsDto
    case 'admin_list': {
      const offset = (payload.page - 1) * payload.pageSize
      const result = await repository.adminList({
        filters: payload.filters,
        limit: payload.pageSize,
        offset,
      })
      return {
        contractVersion: BACKGROUND_JOBS_CONTRACT_VERSION,
        items: result.items.map(({ job, user }) => mapBackgroundJob(job, user)),
        page: payload.page,
        pageSize: payload.pageSize,
        totalCount: result.totalCount,
        totalPages: Math.ceil(result.totalCount / payload.pageSize),
      } satisfies AdminBackgroundJobsPageDto
    }
    case 'admin_get': {
      const details = await repository.adminGetDetails(payload.jobId)
      if (!details) throw ApiError.notFound('Background job not found')
      return {
        contractVersion: BACKGROUND_JOBS_CONTRACT_VERSION,
        events: details.events,
        items: details.items,
        job: mapBackgroundJob(details.job, details.user),
      } satisfies AdminBackgroundJobDetailsDto
    }
    case 'admin_retry': {
      const job = await repository.adminRetry(actorId, payload.jobId)
      if (!job) throw ApiError.conflict('This job cannot be retried in its current state')
      return {
        contractVersion: BACKGROUND_JOBS_CONTRACT_VERSION,
        job: mapBackgroundJob(job, null),
      } satisfies BackgroundJobCommandDto
    }
    case 'admin_cancel': {
      const job = await repository.adminCancel(actorId, payload.jobId)
      if (!job) throw ApiError.conflict('This job cannot be cancelled in its current state')
      return {
        contractVersion: BACKGROUND_JOBS_CONTRACT_VERSION,
        job: mapBackgroundJob(job, null),
      } satisfies BackgroundJobCommandDto
    }
  }
}
