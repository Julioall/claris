import type { AppSupabaseClient, Json } from '../../db/mod.ts'

type RpcResult = Promise<{ data: unknown; error: unknown }>

type WorkerRpcClient = {
  rpc(name: string, parameters: Record<string, unknown>): RpcResult
}

export interface DurableMoodleSyncItem {
  attemptCount: number
  cursor: Json | null
  itemId: string
  itemKey: string
  jobId: string
  jobMetadata: Json
  label: string
  leasedUntil: string
  maxAttempts: number
  metadata: Json
  moodleConnectionId: string
  moodleSiteId: string
  syncPolicy: Json
  userId: string
}

export interface ClaimMoodleSyncItemOptions {
  jobId?: string | null
  leaseSeconds?: number
  maxConnectionLeases?: number
  maxSiteLeases?: number
}

export interface CreateMoodleSyncJobV2Input {
  connectionId: string
  courseIds: string[]
  entities: Array<'students' | 'activities' | 'grades'>
  items: Array<{ itemKey: string; label: string; metadata: Json }>
  sourceRecordId: string
  syncKind: 'initial' | 'incremental'
  trigger: 'initial' | 'scheduler' | 'stale_read' | 'manual' | 'reconciliation'
  userId: string
}

export interface MoodleDeltaShadowContext {
  capabilityAvailable: boolean
  currentRelease: string | null
  watermarkRelease: string | null
  watermarkSince: string | null
}

function asRpcClient(supabase: AppSupabaseClient): WorkerRpcClient {
  return supabase as unknown as WorkerRpcClient
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(row: Record<string, unknown>, field: string): string {
  const value = row[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid durable worker response field: ${field}`)
  }
  return value
}

function requiredInteger(row: Record<string, unknown>, field: string): number {
  const value = row[field]
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`Invalid durable worker response field: ${field}`)
  }
  return Number(value)
}

function asJson(value: unknown, fallback: Json): Json {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value) || isRecord(value)) return value as Json
  return fallback
}

async function invokeRpc(
  supabase: AppSupabaseClient,
  name: string,
  parameters: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await asRpcClient(supabase).rpc(name, parameters)
  if (error) throw error
  return data
}

function booleanResult(value: unknown, operation: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid boolean result returned by ${operation}`)
  }
  return value
}

function nullableStatus(value: unknown, operation: string): string | null {
  if (value === null || typeof value === 'string') return value
  throw new Error(`Invalid status returned by ${operation}`)
}

export async function claimMoodleSyncItem(
  supabase: AppSupabaseClient,
  workerId: string,
  options: ClaimMoodleSyncItemOptions = {},
): Promise<DurableMoodleSyncItem | null> {
  const result = await invokeRpc(supabase, 'backend_claim_moodle_sync_item', {
    p_job_id: options.jobId ?? null,
    p_lease_seconds: options.leaseSeconds ?? 90,
    p_max_connection_leases: options.maxConnectionLeases ?? 2,
    p_max_site_leases: options.maxSiteLeases ?? 4,
    p_worker_id: workerId,
  })
  if (!Array.isArray(result) || result.length === 0) return null
  if (result.length !== 1 || !isRecord(result[0])) {
    throw new Error('Invalid claim result returned by durable Moodle worker')
  }

  const row = result[0]
  return {
    attemptCount: requiredInteger(row, 'attempt_count'),
    cursor: row.item_cursor === null ? null : asJson(row.item_cursor, null),
    itemId: requiredString(row, 'item_id'),
    itemKey: requiredString(row, 'item_key'),
    jobId: requiredString(row, 'job_id'),
    jobMetadata: asJson(row.job_metadata, {}),
    label: requiredString(row, 'label'),
    leasedUntil: requiredString(row, 'leased_until'),
    maxAttempts: requiredInteger(row, 'max_attempts'),
    metadata: asJson(row.item_metadata, {}),
    moodleConnectionId: requiredString(row, 'moodle_connection_id'),
    moodleSiteId: requiredString(row, 'moodle_site_id'),
    syncPolicy: asJson(row.sync_policy, {}),
    userId: requiredString(row, 'user_id'),
  }
}

export async function createMoodleSyncJobV2(
  supabase: AppSupabaseClient,
  input: CreateMoodleSyncJobV2Input,
): Promise<string> {
  const result = await invokeRpc(supabase, 'backend_create_moodle_sync_job_v2_gated', {
    p_course_ids: input.courseIds,
    p_entities: input.entities,
    p_items: input.items.map((item) => ({
      item_key: item.itemKey,
      label: item.label,
      metadata: item.metadata,
    })),
    p_moodle_connection_id: input.connectionId,
    p_source_record_id: input.sourceRecordId,
    p_sync_kind: input.syncKind,
    p_trigger: input.trigger,
    p_user_id: input.userId,
  })
  if (typeof result !== 'string' || result.length === 0) {
    throw new Error('Invalid job id returned by schema-v2 Moodle job creation')
  }
  return result
}

function hasUpdatesSinceCapability(value: unknown): boolean {
  if (!isRecord(value)) return false
  const functions = value.functions
  return Array.isArray(functions)
    && functions.some((name) => name === 'core_course_get_updates_since')
}

export async function loadMoodleDeltaShadowContext(
  supabase: AppSupabaseClient,
  input: {
    connectionId: string
    courseId: string
    entity: 'students' | 'activities' | 'grades'
    siteId: string
  },
): Promise<MoodleDeltaShadowContext> {
  const [{ data: connection, error: connectionError }, { data: site, error: siteError }, {
    data: watermark,
    error: watermarkError,
  }] = await Promise.all([
    supabase
      .from('user_moodle_connections')
      .select('capabilities, moodle_site_id')
      .eq('id', input.connectionId)
      .maybeSingle(),
    supabase
      .from('moodle_sites')
      .select('release')
      .eq('id', input.siteId)
      .maybeSingle(),
    supabase
      .from('moodle_sync_watermarks')
      .select('moodle_since, source_release')
      .eq('moodle_connection_id', input.connectionId)
      .eq('course_id', input.courseId)
      .eq('entity', input.entity)
      .maybeSingle(),
  ])

  if (connectionError) throw connectionError
  if (siteError) throw siteError
  if (watermarkError) throw watermarkError
  if (!connection || connection.moodle_site_id !== input.siteId || !site) {
    throw new Error('Moodle delta context is outside the connection scope')
  }

  return {
    capabilityAvailable: hasUpdatesSinceCapability(connection.capabilities),
    currentRelease: site.release,
    watermarkRelease: watermark?.source_release ?? null,
    watermarkSince: watermark?.moodle_since ?? null,
  }
}

export async function heartbeatMoodleSyncItem(
  supabase: AppSupabaseClient,
  input: {
    cursor?: Json | null
    itemId: string
    leaseSeconds?: number
    progressCurrent?: number | null
    workerId: string
  },
): Promise<boolean> {
  return booleanResult(await invokeRpc(supabase, 'backend_heartbeat_moodle_sync_item', {
    p_cursor: input.cursor ?? null,
    p_item_id: input.itemId,
    p_lease_seconds: input.leaseSeconds ?? 90,
    p_progress_current: input.progressCurrent ?? null,
    p_worker_id: input.workerId,
  }), 'Moodle sync heartbeat')
}

export async function checkpointMoodleSyncItem(
  supabase: AppSupabaseClient,
  input: {
    cursor: Json
    itemId: string
    progressCurrent?: number | null
    resumeAfterSeconds?: number
    workerId: string
  },
): Promise<boolean> {
  return booleanResult(await invokeRpc(supabase, 'backend_checkpoint_moodle_sync_item', {
    p_cursor: input.cursor,
    p_item_id: input.itemId,
    p_progress_current: input.progressCurrent ?? null,
    p_resume_after_seconds: input.resumeAfterSeconds ?? 0,
    p_worker_id: input.workerId,
  }), 'Moodle sync checkpoint')
}

export async function completeMoodleSyncItem(
  supabase: AppSupabaseClient,
  input: {
    cursor?: Json | null
    itemId: string
    progressCurrent?: number | null
    resultMetadata?: Json
    workerId: string
  },
): Promise<string | null> {
  return nullableStatus(await invokeRpc(supabase, 'backend_complete_moodle_sync_item', {
    p_cursor: input.cursor ?? null,
    p_item_id: input.itemId,
    p_progress_current: input.progressCurrent ?? null,
    p_result_metadata: input.resultMetadata ?? {},
    p_worker_id: input.workerId,
  }), 'Moodle sync completion')
}

export async function failMoodleSyncItem(
  supabase: AppSupabaseClient,
  input: {
    cursor?: Json | null
    errorCode: string
    errorMessage: string
    itemId: string
    retryAfterSeconds?: number
    retryable?: boolean
    workerId: string
  },
): Promise<string | null> {
  return nullableStatus(await invokeRpc(supabase, 'backend_fail_moodle_sync_item', {
    p_cursor: input.cursor ?? null,
    p_error_code: input.errorCode,
    p_error_message: input.errorMessage,
    p_item_id: input.itemId,
    p_retry_after_seconds: input.retryAfterSeconds ?? 30,
    p_retryable: input.retryable ?? false,
    p_worker_id: input.workerId,
  }), 'Moodle sync failure')
}

export async function recordMoodleSiteCircuitResult(
  supabase: AppSupabaseClient,
  input: {
    failureCode?: string | null
    moodleSiteId: string
    success: boolean
  },
): Promise<void> {
  await invokeRpc(supabase, 'backend_record_moodle_site_circuit_result', {
    p_failure_code: input.failureCode ?? null,
    p_moodle_site_id: input.moodleSiteId,
    p_success: input.success,
  })
}

export async function cancelMoodleSyncJob(
  supabase: AppSupabaseClient,
  jobId: string,
  userId: string,
): Promise<boolean> {
  return booleanResult(await invokeRpc(supabase, 'backend_cancel_moodle_sync_job', {
    p_job_id: jobId,
    p_user_id: userId,
  }), 'Moodle sync cancellation')
}

export async function retryMoodleSyncJob(
  supabase: AppSupabaseClient,
  jobId: string,
  userId: string,
): Promise<boolean> {
  return booleanResult(await invokeRpc(supabase, 'backend_retry_moodle_sync_job', {
    p_job_id: jobId,
    p_user_id: userId,
  }), 'Moodle sync retry')
}
