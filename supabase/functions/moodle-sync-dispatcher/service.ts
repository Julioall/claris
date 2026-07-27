import type { AppSupabaseClient } from '../_shared/db/mod.ts'

export interface MoodleSyncDispatchItem {
  connectionId: string
  courseId: string
  dispatchStatus: string
  jobId: string | null
  nextIncrementalAt: string | null
  trigger: string
}

export interface MoodleSyncDispatchResult {
  counts: Record<string, number>
  items: MoodleSyncDispatchItem[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function mapItem(value: unknown): MoodleSyncDispatchItem | null {
  if (!isRecord(value)) return null
  const connectionId = nullableString(value.connection_id)
  const courseId = nullableString(value.course_id)
  const dispatchStatus = nullableString(value.dispatch_status)
  const trigger = nullableString(value.trigger)
  if (!connectionId || !courseId || !dispatchStatus || !trigger) return null
  return {
    connectionId,
    courseId,
    dispatchStatus,
    jobId: nullableString(value.job_id),
    nextIncrementalAt: nullableString(value.next_incremental_at),
    trigger,
  }
}

export function mapMoodleSyncDispatchResult(value: unknown): MoodleSyncDispatchResult {
  const items = Array.isArray(value)
    ? value.map(mapItem).filter((item): item is MoodleSyncDispatchItem => item !== null)
    : []
  const counts = items.reduce<Record<string, number>>((result, item) => {
    result[item.dispatchStatus] = (result[item.dispatchStatus] ?? 0) + 1
    return result
  }, {})
  return { counts, items }
}

export async function dispatchDueMoodleSyncs(
  supabase: AppSupabaseClient,
  limit: number,
): Promise<MoodleSyncDispatchResult> {
  const { data, error } = await supabase.rpc('backend_dispatch_due_moodle_syncs', {
    p_limit: limit,
  } as never)
  if (error) throw error
  return mapMoodleSyncDispatchResult(data)
}
