import { createServiceClient, type AppSupabaseClient, type Json } from '../../db/mod.ts'
import {
  MoodleConnectionError,
  resolveMoodleAccess,
  type MoodleAccess,
} from '../moodle-connections/mod.ts'
import { recalculateRiskForCourses } from '../risk/recalculation.ts'
import { findCourseById, type CourseSyncRecord } from './repository.ts'
import {
  checkpointMoodleSyncItem,
  claimMoodleSyncItem,
  completeMoodleSyncItem,
  failMoodleSyncItem,
  heartbeatMoodleSyncItem,
  type DurableMoodleSyncItem,
} from './worker-repository.ts'
import { syncStudents } from '../../../moodle-sync-students/service.ts'
import { syncActivities } from '../../../moodle-sync-activities/service.ts'
import { syncGrades } from '../../../moodle-sync-grades/service.ts'

export { resolveMoodleAccess } from '../moodle-connections/mod.ts'

export const MOODLE_SYNC_JOB_TYPE = 'moodle_sync'
export const DEFAULT_MOODLE_SYNC_BUDGET_MS = 25_000
export const DEFAULT_MOODLE_SYNC_LEASE_SECONDS = 90

const MINIMUM_NEXT_ITEM_BUDGET_MS = 2_000
const MAX_ERROR_MESSAGE_LENGTH = 800

export type MoodleSyncEntity = 'students' | 'activities' | 'grades'
export type MoodleSyncKind = 'initial' | 'incremental'

export interface MoodleSyncJobMetadataV2 {
  course_ids: string[]
  entities: MoodleSyncEntity[]
  schema_version: 2
  sync_kind: MoodleSyncKind
}

export interface MoodleSyncWorkerOptions {
  budgetMs?: number
  leaseSeconds?: number
  maxConnectionLeases?: number
  maxSiteLeases?: number
  now?: () => number
  workerId?: string
}

export interface MoodleSyncWorkerResult {
  claimedItems: number
  completedItems: number
  checkpointedItems: number
  failedItems: number
  retryScheduledItems: number
}

interface ItemExecutionResult {
  checkpoint?: {
    cursor: Json
    progressCurrent: number
  }
  cursor?: Json | null
  resultMetadata?: Json
}

interface PagedCursor {
  page: number
  totalCount: number
}

class MoodleSyncExecutionError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly retryAfterSeconds: number

  constructor(
    code: string,
    message: string,
    retryable = false,
    retryAfterSeconds = 30,
  ) {
    super(message)
    this.name = 'MoodleSyncExecutionError'
    this.code = code
    this.retryable = retryable
    this.retryAfterSeconds = retryAfterSeconds
  }
}

class MoodleSyncLeaseLostError extends Error {
  constructor() {
    super('Moodle sync item lease is no longer owned by this worker.')
    this.name = 'MoodleSyncLeaseLostError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function record(value: Json | null): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function readMetadata(value: Json): MoodleSyncJobMetadataV2 {
  const metadata = record(value)
  const courseIds = metadata.course_ids
  const entities = metadata.entities
  const syncKind = metadata.sync_kind

  if (
    metadata.schema_version !== 2
    || !Array.isArray(courseIds)
    || courseIds.length === 0
    || !courseIds.every((item): item is string => typeof item === 'string' && item.length > 0)
    || new Set(courseIds).size !== courseIds.length
    || !Array.isArray(entities)
    || !entities.every((item): item is MoodleSyncEntity => (
      item === 'students' || item === 'activities' || item === 'grades'
    ))
    || (syncKind !== 'initial' && syncKind !== 'incremental')
  ) {
    throw new MoodleSyncExecutionError(
      'invalid_job_metadata_v2',
      'Invalid schema-v2 Moodle sync job metadata.',
    )
  }

  return {
    course_ids: courseIds,
    entities,
    schema_version: 2,
    sync_kind: syncKind,
  }
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new MoodleSyncExecutionError('invalid_work_item', `Invalid Moodle work item field: ${field}.`)
  }
  return value
}

function readNonnegativeInteger(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback
}

function readPagedCursor(value: Json | null): PagedCursor {
  const cursor = record(value)
  return {
    page: Math.max(1, readNonnegativeInteger(cursor.page, 1)),
    totalCount: readNonnegativeInteger(cursor.total_count, 0),
  }
}

function serviceErrorCode(status: number): string {
  if (status === 408) return 'moodle_timeout'
  if (status === 429) return 'moodle_rate_limited'
  if (status >= 500) return 'moodle_server_error'
  if (status === 401 || status === 403) return 'moodle_authorization_error'
  if (status === 404) return 'moodle_resource_not_found'
  return 'moodle_sync_service_error'
}

async function parseServiceResponse(response: Response): Promise<Record<string, unknown>> {
  let payload: Record<string, unknown> = {}
  try {
    const parsed = await response.json()
    if (isRecord(parsed)) payload = parsed
  } catch {
    payload = {}
  }

  if (!response.ok || payload.success === false || typeof payload.error === 'string') {
    const status = response.status
    const retryable = status === 408 || status === 429 || status >= 500
    throw new MoodleSyncExecutionError(
      serviceErrorCode(status),
      typeof payload.error === 'string'
        ? payload.error.slice(0, MAX_ERROR_MESSAGE_LENGTH)
        : `Moodle sync service failed with status ${status}.`,
      retryable,
      status === 429 ? 60 : 30,
    )
  }

  const errorCount = readNonnegativeInteger(payload.errorCount, 0)
  if (errorCount > 0) {
    throw new MoodleSyncExecutionError(
      'partial_sync_failure',
      `${errorCount} Moodle synchronization operation(s) failed.`,
      true,
    )
  }

  return payload
}

function classifyError(error: unknown): MoodleSyncExecutionError {
  if (error instanceof MoodleSyncExecutionError) return error
  if (error instanceof MoodleConnectionError) {
    return new MoodleSyncExecutionError(error.code, error.message, false)
  }
  if (error instanceof Error) {
    const normalized = error.message.toLowerCase()
    const retryable = error.name === 'AbortError'
      || error instanceof TypeError
      || normalized.includes('timeout')
      || normalized.includes('timed out')
      || normalized.includes('network')
      || normalized.includes('fetch failed')
    return new MoodleSyncExecutionError(
      retryable ? 'moodle_transport_error' : 'moodle_item_failed',
      error.message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
      retryable,
    )
  }
  return new MoodleSyncExecutionError('moodle_item_failed', 'Unexpected Moodle sync item failure.')
}

async function loadScopedCourse(
  supabase: AppSupabaseClient,
  item: DurableMoodleSyncItem,
): Promise<CourseSyncRecord> {
  const courseId = readString(record(item.metadata).course_id, 'course_id')
  const course = await findCourseById(supabase, courseId)
  if (!course) {
    throw new MoodleSyncExecutionError('course_not_found', 'Moodle sync course was not found.')
  }
  if (course.moodle_site_id !== item.moodleSiteId) {
    throw new MoodleSyncExecutionError(
      'course_connection_site_mismatch',
      'Moodle sync course and connection belong to different sites.',
    )
  }
  return course
}

async function resolveScopedAccess(
  supabase: AppSupabaseClient,
  item: DurableMoodleSyncItem,
  accessCache: Map<string, Promise<MoodleAccess>>,
): Promise<MoodleAccess> {
  let accessPromise = accessCache.get(item.moodleConnectionId)
  if (!accessPromise) {
    accessPromise = resolveMoodleAccess(supabase, item.userId, item.moodleConnectionId)
    accessCache.set(item.moodleConnectionId, accessPromise)
  }
  const access = await accessPromise
  if (
    access.userId !== item.userId
    || access.connectionId !== item.moodleConnectionId
    || access.moodleSiteId !== item.moodleSiteId
  ) {
    throw new MoodleSyncExecutionError(
      'connection_context_mismatch',
      'Resolved Moodle access does not match the durable work item context.',
    )
  }
  return access
}

async function executePagedEntity(
  entity: 'activities' | 'grades',
  access: MoodleAccess,
  course: CourseSyncRecord,
  cursor: Json | null,
): Promise<ItemExecutionResult> {
  const state = readPagedCursor(cursor)
  const externalCourseId = Number.parseInt(course.moodle_course_id, 10)
  if (!Number.isSafeInteger(externalCourseId) || externalCourseId <= 0) {
    throw new MoodleSyncExecutionError('invalid_moodle_course_id', 'Course has an invalid Moodle id.')
  }

  const response = entity === 'activities'
    ? await syncActivities(access, course, {
      studentBatchPage: state.page,
      studentBatchSize: 12,
    })
    : await syncGrades(access.moodleUrl, access.token, externalCourseId, {
      connectionId: access.connectionId,
      moodleSiteId: access.moodleSiteId,
      siteSlug: access.siteSlug,
      studentBatchPage: state.page,
      studentBatchSize: 10,
    })
  const payload = await parseServiceResponse(response)
  const pageCount = readNonnegativeInteger(
    payload[entity === 'activities' ? 'activitiesCount' : 'gradesCount'],
    0,
  )
  const totalCount = state.totalCount + pageCount

  if (payload.hasMore === true) {
    const responseNextPage = readNonnegativeInteger(payload.nextStudentBatchPage, state.page + 1)
    const nextPage = responseNextPage > state.page ? responseNextPage : state.page + 1
    return {
      checkpoint: {
        cursor: { page: nextPage, total_count: totalCount },
        progressCurrent: state.page,
      },
    }
  }

  return {
    cursor: { page: state.page, total_count: totalCount },
    resultMetadata: {
      error_count: 0,
      fetch_mode: typeof payload.fetchMode === 'string' ? payload.fetchMode : null,
      total_count: totalCount,
    },
  }
}

async function validateRiskCourseScope(
  supabase: AppSupabaseClient,
  item: DurableMoodleSyncItem,
  metadata: MoodleSyncJobMetadataV2,
): Promise<void> {
  const courses = await Promise.all(metadata.course_ids.map((courseId) => findCourseById(supabase, courseId)))
  if (courses.some((course) => !course || course.moodle_site_id !== item.moodleSiteId)) {
    throw new MoodleSyncExecutionError(
      'risk_course_connection_site_mismatch',
      'Risk recalculation contains a course outside the Moodle connection site.',
    )
  }
}

async function executeClaimedItem(
  supabase: AppSupabaseClient,
  item: DurableMoodleSyncItem,
  accessCache: Map<string, Promise<MoodleAccess>>,
): Promise<ItemExecutionResult> {
  const metadata = readMetadata(item.jobMetadata)
  const entity = item.itemKey.includes(':') ? item.itemKey.split(':', 1)[0] : item.itemKey

  if (entity === 'risk') {
    await validateRiskCourseScope(supabase, item, metadata)
    const result = await recalculateRiskForCourses(supabase, metadata.course_ids)
    if (result.failedCount > 0 || result.missingRpc) {
      throw new MoodleSyncExecutionError(
        'risk_recalculation_failed',
        `Risk recalculation failed for ${result.failedCount} course(s).`,
        result.missingRpc === false,
      )
    }
    return {
      resultMetadata: {
        error_count: 0,
        total_count: result.updatedCount,
      },
    }
  }

  if (entity !== 'students' && entity !== 'activities' && entity !== 'grades') {
    throw new MoodleSyncExecutionError(
      'unsupported_work_item',
      'Only schema-v2 Moodle entity work items can be executed by this worker.',
    )
  }

  const [access, course] = await Promise.all([
    resolveScopedAccess(supabase, item, accessCache),
    loadScopedCourse(supabase, item),
  ])

  if (entity === 'students') {
    const payload = await parseServiceResponse(await syncStudents(access, course))
    return {
      resultMetadata: {
        error_count: 0,
        total_count: Array.isArray(payload.students)
          ? payload.students.length
          : readNonnegativeInteger(payload.studentsCount, 0),
      },
    }
  }

  return await executePagedEntity(entity, access, course, item.cursor)
}

async function executeWithLeaseHeartbeat<T>(
  supabase: AppSupabaseClient,
  item: DurableMoodleSyncItem,
  workerId: string,
  leaseSeconds: number,
  action: () => Promise<T>,
): Promise<T> {
  let heartbeatInFlight: Promise<void> | null = null
  let heartbeatError: unknown = null
  let leaseLost = false
  const intervalMs = Math.max(3_000, Math.floor(leaseSeconds * 1_000 / 3))
  const timer = setInterval(() => {
    if (heartbeatInFlight || heartbeatError || leaseLost) return
    heartbeatInFlight = heartbeatMoodleSyncItem(supabase, {
      cursor: item.cursor,
      itemId: item.itemId,
      leaseSeconds,
      workerId,
    }).then((renewed) => {
      if (!renewed) leaseLost = true
    }).catch((error) => {
      heartbeatError = error
    }).finally(() => {
      heartbeatInFlight = null
    })
  }, intervalMs)

  try {
    const value = await action()
    if (heartbeatInFlight) await heartbeatInFlight
    if (leaseLost) throw new MoodleSyncLeaseLostError()
    if (heartbeatError) throw heartbeatError
    return value
  } finally {
    clearInterval(timer)
  }
}

function emptyWorkerResult(): MoodleSyncWorkerResult {
  return {
    claimedItems: 0,
    completedItems: 0,
    checkpointedItems: 0,
    failedItems: 0,
    retryScheduledItems: 0,
  }
}

export async function runMoodleSyncJob(
  jobId: string | null = null,
  supabase: AppSupabaseClient = createServiceClient(),
  options: MoodleSyncWorkerOptions = {},
): Promise<MoodleSyncWorkerResult> {
  const budgetMs = options.budgetMs ?? DEFAULT_MOODLE_SYNC_BUDGET_MS
  const leaseSeconds = options.leaseSeconds ?? DEFAULT_MOODLE_SYNC_LEASE_SECONDS
  if (budgetMs < 1_000 || budgetMs > 55_000) {
    throw new Error('Moodle sync worker budget must be between 1000 and 55000 milliseconds.')
  }

  const now = options.now ?? Date.now
  const startedAt = now()
  const workerId = options.workerId ?? `moodle-sync:${crypto.randomUUID()}`
  const accessCache = new Map<string, Promise<MoodleAccess>>()
  const result = emptyWorkerResult()

  while (now() - startedAt <= budgetMs - MINIMUM_NEXT_ITEM_BUDGET_MS) {
    const item = await claimMoodleSyncItem(supabase, workerId, {
      jobId,
      leaseSeconds,
      maxConnectionLeases: options.maxConnectionLeases,
      maxSiteLeases: options.maxSiteLeases,
    })
    if (!item) break
    result.claimedItems += 1

    try {
      const leaseExtended = await heartbeatMoodleSyncItem(supabase, {
        cursor: item.cursor,
        itemId: item.itemId,
        leaseSeconds,
        workerId,
      })
      if (!leaseExtended) throw new MoodleSyncLeaseLostError()

      const execution = await executeWithLeaseHeartbeat(
        supabase,
        item,
        workerId,
        leaseSeconds,
        () => executeClaimedItem(supabase, item, accessCache),
      )
      if (execution.checkpoint) {
        const saved = await checkpointMoodleSyncItem(supabase, {
          cursor: execution.checkpoint.cursor,
          itemId: item.itemId,
          progressCurrent: execution.checkpoint.progressCurrent,
          workerId,
        })
        if (!saved) throw new MoodleSyncLeaseLostError()
        result.checkpointedItems += 1
        continue
      }

      const completed = await completeMoodleSyncItem(supabase, {
        cursor: execution.cursor,
        itemId: item.itemId,
        progressCurrent: 1,
        resultMetadata: execution.resultMetadata,
        workerId,
      })
      if (completed === null) throw new MoodleSyncLeaseLostError()
      result.completedItems += 1
    } catch (error) {
      if (error instanceof MoodleSyncLeaseLostError) {
        console.warn('[moodle-sync-worker] Lease lost.', {
          itemId: item.itemId,
          jobId: item.jobId,
        })
        continue
      }

      const classified = classifyError(error)
      const failureStatus = await failMoodleSyncItem(supabase, {
        cursor: item.cursor,
        errorCode: classified.code,
        errorMessage: classified.message,
        itemId: item.itemId,
        retryAfterSeconds: classified.retryAfterSeconds,
        retryable: classified.retryable,
        workerId,
      })
      if (failureStatus === null) {
        console.warn('[moodle-sync-worker] Failure ignored after lease loss or cancellation.', {
          errorCode: classified.code,
          itemId: item.itemId,
          jobId: item.jobId,
        })
      } else if (failureStatus === 'retry_scheduled') {
        result.retryScheduledItems += 1
      } else {
        result.failedItems += 1
      }
    }
  }

  return result
}

export function scheduleMoodleSyncJob(jobId: string): void {
  const task = runMoodleSyncJob(jobId).catch((error) => {
    const classified = classifyError(error)
    console.error('[moodle-sync-worker] Unhandled worker error.', {
      errorCode: classified.code,
      jobId,
    })
  })
  const runtime = globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void }
  }
  if (runtime.EdgeRuntime?.waitUntil) runtime.EdgeRuntime.waitUntil(task)
}
