import { ApiError } from '../_shared/http/mod.ts'
import type { Json } from '../_shared/db/mod.ts'
import type {
  BackgroundJobItemRecord,
  BackgroundJobRecord,
} from '../_shared/domain/background-jobs/repository.ts'
import {
  MOODLE_SYNC_JOBS_CONTRACT_VERSION,
  type MoodleRiskRecalculationDto,
  type MoodleSyncActiveJobsDto,
  type MoodleSyncCommandDto,
  type MoodleSyncCourseCountsDto,
  type MoodleSyncCourseDto,
  type MoodleSyncCoursesDto,
  type MoodleSyncEntityDto,
  type MoodleSyncJobDto,
  type MoodleSyncJobResponseDto,
  type MoodleSyncJobStatusDto,
  type MoodleSyncJobStepDto,
  type MoodleSyncJobsResponseDto,
  type MoodleSyncPreferencesDto,
  type MoodleSyncStepEntityDto,
} from './contract.ts'
import type { MoodleSyncJobsPayload } from './payload.ts'
import type { MoodleSyncJobsRepository } from './repository.ts'

export interface MoodleSyncJobsRuntime {
  listAvailableCourses(actorId: string, connectionId: string): Promise<MoodleSyncCourseDto[]>
  recalculateRisk(actorId: string, courseIds: string[]): Promise<{
    failedCount: number
    missingRpc: boolean
    updatedCount: number
    usedFallback: boolean
  }>
  schedule(jobId: string): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function metadataRecord(value: Json): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function metadataStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function metadataConnectionId(value: Json): string | null {
  const connectionId = metadataRecord(value).connection_id
  return typeof connectionId === 'string' && connectionId.length > 0 ? connectionId : null
}

async function assertBulkRollout(
  repository: MoodleSyncJobsRepository,
  actorId: string,
  connectionId: string,
): Promise<void> {
  if (!await repository.isRolloutEnabled(actorId, connectionId, 'bulk')) {
    throw ApiError.conflict('Moodle bulk synchronization rollout is disabled for this connection site.')
  }
}

function itemEntity(item: BackgroundJobItemRecord): MoodleSyncStepEntityDto | null {
  const key = item.item_key ?? ''
  const entity = key.includes(':') ? key.split(':', 1)[0] : key
  return entity === 'courses'
    || entity === 'students'
    || entity === 'activities'
    || entity === 'grades'
    || entity === 'risk'
    ? entity
    : null
}

function aggregateStep(
  entity: MoodleSyncStepEntityDto,
  items: BackgroundJobItemRecord[],
): MoodleSyncJobStepDto {
  const matching = items.filter((item) => itemEntity(item) === entity)
  const status: MoodleSyncJobStatusDto = matching.some((item) => item.status === 'failed')
    ? 'failed'
    : matching.some((item) => item.status === 'processing')
    ? 'processing'
    : matching.some((item) => item.status === 'cancelled')
    ? 'cancelled'
    : matching.length > 0 && matching.every((item) => item.status === 'completed')
    ? 'completed'
    : 'pending'
  const errorMessage = matching
    .map((item) => item.error_message)
    .find((message): message is string => typeof message === 'string' && message.length > 0) ?? null
  const recordCount = matching.reduce((sum, item) => {
    const value = Number(metadataRecord(item.metadata).total_count ?? 0)
    return sum + (Number.isSafeInteger(value) && value >= 0 ? value : 0)
  }, 0)
  return {
    entity,
    errorMessage,
    processedItems: matching.filter((item) => (
      item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled'
    )).length,
    recordCount,
    status,
    totalItems: matching.length,
  }
}

export function mapMoodleSyncJob(
  job: BackgroundJobRecord,
  items: BackgroundJobItemRecord[],
): MoodleSyncJobDto {
  const metadata = metadataRecord(job.metadata)
  if (metadata.schema_version !== 2 || typeof metadata.connection_id !== 'string') {
    throw ApiError.conflict('Legacy Moodle sync jobs are not supported')
  }
  const kind = metadata.sync_kind === 'incremental' ? 'incremental' : 'initial'
  const entities = metadataStringArray(metadata.entities).filter(
    (entity): entity is MoodleSyncEntityDto => (
      entity === 'students' || entity === 'activities' || entity === 'grades'
    ),
  )
  const stepEntities: MoodleSyncStepEntityDto[] = [
    ...entities,
    'risk',
  ]
  return {
    completedAt: job.completed_at,
    connectionId: metadata.connection_id,
    courseIds: metadataStringArray(metadata.course_ids),
    createdAt: job.created_at,
    entities,
    errorCount: job.error_count,
    errorMessage: job.error_message,
    id: job.id,
    kind,
    processedItems: job.processed_items,
    startedAt: job.started_at,
    status: job.status,
    steps: stepEntities.map((entity) => aggregateStep(entity, items)),
    successCount: job.success_count,
    totalItems: job.total_items,
    updatedAt: job.updated_at,
  }
}

async function loadJobDto(
  repository: MoodleSyncJobsRepository,
  actorId: string,
  jobId: string,
): Promise<MoodleSyncJobDto> {
  const job = await repository.getJob(actorId, jobId)
  if (!job) throw ApiError.notFound('Moodle sync job not found')
  return mapMoodleSyncJob(job, await repository.getJobItems(job.id))
}

async function canonicalRequestId(
  actorId: string,
  connectionId: string,
  kind: 'initial' | 'incremental',
  courseIds: string[],
  entities: MoodleSyncEntityDto[],
): Promise<string> {
  const source = JSON.stringify({
    actorId,
    connectionId,
    courseIds: [...courseIds].sort(),
    entities: [...entities].sort(),
    kind,
  })
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)))
  const bytes = digest.slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function buildItems(
  courseIds: string[],
  entities: MoodleSyncEntityDto[],
): Array<{ itemKey: string; label: string; metadata: Json }> {
  const labels: Record<MoodleSyncEntityDto, string> = {
    students: 'Sincronizar alunos',
    activities: 'Sincronizar atividades',
    grades: 'Sincronizar notas',
  }
  return [
    ...entities.flatMap((entity) => courseIds.map((courseId) => ({
      itemKey: `${entity}:${courseId}`,
      label: labels[entity],
      metadata: { course_id: courseId, entity } as Json,
    }))),
    {
      itemKey: 'risk',
      label: 'Finalizar curso e recalcular risco',
      metadata: { entity: 'risk' } as Json,
    },
  ]
}

async function startJob(
  repository: MoodleSyncJobsRepository,
  runtime: MoodleSyncJobsRuntime,
  actorId: string,
  connectionId: string,
  kind: 'initial' | 'incremental',
  courseIds: string[],
  entities: MoodleSyncEntityDto[],
): Promise<MoodleSyncJobResponseDto> {
  if (!await repository.hasCourseScope(actorId, connectionId, courseIds, kind)) {
    throw ApiError.forbidden('One or more courses are outside the authenticated actor scope')
  }
  await assertBulkRollout(repository, actorId, connectionId)
  if (kind === 'initial') {
    try {
      await repository.linkEligibleCourses(actorId, connectionId, courseIds)
    } catch (error) {
      if (isRecord(error) && error.code === '42501') {
        throw ApiError.forbidden('One or more courses are outside the connection eligibility')
      }
      throw error
    }
  }

  const sourceRecordId = await canonicalRequestId(actorId, connectionId, kind, courseIds, entities)
  const existing = await repository.findActiveJob(actorId, sourceRecordId)
  if (existing) {
    return {
      contractVersion: MOODLE_SYNC_JOBS_CONTRACT_VERSION,
      duplicate: true,
      job: mapMoodleSyncJob(existing, await repository.getJobItems(existing.id)),
    }
  }

  let job: BackgroundJobRecord
  try {
    job = await repository.createJob({
      actorId,
      connectionId,
      courseIds,
      entities,
      itemDefinitions: buildItems(courseIds, entities),
      kind,
      sourceRecordId,
      trigger: kind === 'initial' ? 'initial' : 'manual',
    })
  } catch (error) {
    const concurrent = await repository.findActiveJob(actorId, sourceRecordId)
    if (!concurrent) {
      const details = isRecord(error)
        ? {
            code: typeof error.code === 'string' ? error.code : undefined,
            message: typeof error.message === 'string' ? error.message : undefined,
          }
        : { message: error instanceof Error ? error.message : 'Unknown persistence error' }
      console.error('[moodle-sync-jobs] Failed to create job:', details)
      throw error
    }
    return {
      contractVersion: MOODLE_SYNC_JOBS_CONTRACT_VERSION,
      duplicate: true,
      job: mapMoodleSyncJob(concurrent, await repository.getJobItems(concurrent.id)),
    }
  }

  runtime.schedule(job.id)
  return {
    contractVersion: MOODLE_SYNC_JOBS_CONTRACT_VERSION,
    duplicate: false,
    job: mapMoodleSyncJob(job, await repository.getJobItems(job.id)),
  }
}

export async function authorizeMoodleSyncJobs(
  repository: MoodleSyncJobsRepository,
  actorId: string,
  payload: MoodleSyncJobsPayload,
): Promise<boolean> {
  switch (payload.action) {
    case 'list_available_courses':
    case 'start_initial_sync':
    case 'get_course_student_counts':
      return await repository.hasPermission(actorId, 'courses.catalog.view')
    case 'start_course_sync':
    case 'recalculate_risk':
      return await repository.hasPermission(actorId, 'courses.panel.view')
    default:
      return true
  }
}

export async function executeMoodleSyncJobs(
  repository: MoodleSyncJobsRepository,
  actorId: string,
  payload: MoodleSyncJobsPayload,
  runtime: MoodleSyncJobsRuntime,
): Promise<MoodleSyncJobsResponseDto> {
  switch (payload.action) {
    case 'list_available_courses': {
      await assertBulkRollout(repository, actorId, payload.connectionId)
      const items = await runtime.listAvailableCourses(actorId, payload.connectionId)
      return { contractVersion: MOODLE_SYNC_JOBS_CONTRACT_VERSION, items } satisfies MoodleSyncCoursesDto
    }
    case 'start_initial_sync':
      return await startJob(
        repository,
        runtime,
        actorId,
        payload.connectionId,
        'initial',
        payload.courseIds,
        ['students', 'activities', 'grades'],
      )
    case 'start_course_sync':
      return await startJob(
        repository,
        runtime,
        actorId,
        payload.connectionId,
        'incremental',
        payload.courseIds,
        payload.entities,
      )
    case 'get_job':
      return {
        contractVersion: MOODLE_SYNC_JOBS_CONTRACT_VERSION,
        duplicate: false,
        job: await loadJobDto(repository, actorId, payload.jobId),
      } satisfies MoodleSyncJobResponseDto
    case 'list_active_jobs': {
      const jobs = await repository.listActiveJobs(actorId)
      return {
        contractVersion: MOODLE_SYNC_JOBS_CONTRACT_VERSION,
        items: await Promise.all(jobs.map(async (job) => (
          mapMoodleSyncJob(job, await repository.getJobItems(job.id))
        ))),
      } satisfies MoodleSyncActiveJobsDto
    }
    case 'retry_job': {
      const existing = await repository.getJob(actorId, payload.jobId)
      const connectionId = existing ? metadataConnectionId(existing.metadata) : null
      if (connectionId) await assertBulkRollout(repository, actorId, connectionId)
      const job = await repository.resetOwnedJob(actorId, payload.jobId)
      if (!job) throw ApiError.conflict('Only failed or cancelled Moodle sync jobs can be retried')
      runtime.schedule(job.id)
      return {
        contractVersion: MOODLE_SYNC_JOBS_CONTRACT_VERSION,
        job: mapMoodleSyncJob(job, await repository.getJobItems(job.id)),
      } satisfies MoodleSyncCommandDto
    }
    case 'cancel_job': {
      const job = await repository.cancelOwnedJob(actorId, payload.jobId)
      if (!job) throw ApiError.conflict('Only pending or processing Moodle sync jobs can be cancelled')
      return {
        contractVersion: MOODLE_SYNC_JOBS_CONTRACT_VERSION,
        job: mapMoodleSyncJob(job, await repository.getJobItems(job.id)),
      } satisfies MoodleSyncCommandDto
    }
    case 'get_preferences': {
      const preferences = await repository.getPreferences(actorId, payload.connectionId) ?? {
        includeEmptyCourses: false,
        includeFinished: false,
        selectedKeys: [],
      }
      return {
        contractVersion: MOODLE_SYNC_JOBS_CONTRACT_VERSION,
        ...preferences,
      } satisfies MoodleSyncPreferencesDto
    }
    case 'save_preferences': {
      const preferences = await repository.savePreferences(actorId, payload.connectionId, payload)
      return {
        contractVersion: MOODLE_SYNC_JOBS_CONTRACT_VERSION,
        ...preferences,
      } satisfies MoodleSyncPreferencesDto
    }
    case 'get_course_student_counts': {
      if (!await repository.hasCourseScope(actorId, payload.connectionId, payload.courseIds, 'initial')) {
        throw ApiError.forbidden('One or more courses are outside the authenticated actor scope')
      }
      const counts = await repository.getCourseStudentCounts(payload.courseIds)
      return {
        contractVersion: MOODLE_SYNC_JOBS_CONTRACT_VERSION,
        counts: payload.courseIds.map((courseId) => ({
          courseId,
          studentCount: counts.get(courseId) ?? 0,
        })),
      } satisfies MoodleSyncCourseCountsDto
    }
    case 'recalculate_risk': {
      if (!await repository.hasCourseScope(actorId, payload.connectionId, payload.courseIds, 'incremental')) {
        throw ApiError.forbidden('One or more courses are outside the authenticated actor scope')
      }
      return {
        contractVersion: MOODLE_SYNC_JOBS_CONTRACT_VERSION,
        ...await runtime.recalculateRisk(actorId, payload.courseIds),
      } satisfies MoodleRiskRecalculationDto
    }
  }
}
