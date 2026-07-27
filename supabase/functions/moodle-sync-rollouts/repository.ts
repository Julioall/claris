import { isApplicationAdmin } from '../_shared/auth/mod.ts'
import { createServiceClient, type AppSupabaseClient } from '../_shared/db/mod.ts'
import type { MoodleSyncRolloutCapability } from '../_shared/domain/moodle-sync/rollout.ts'

export interface MoodleSyncRolloutRecord {
  capability: MoodleSyncRolloutCapability
  enabled: boolean
  moodle_site_id: string
  updated_at: string
  updated_by: string | null
  user_id: string | null
}

type RolloutRpcClient = {
  rpc(name: string, parameters: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>
}

export interface MoodleSyncRolloutsRepository {
  isApplicationAdmin(actorId: string): Promise<boolean>
  list(actorId: string): Promise<MoodleSyncRolloutRecord[]>
  set(input: {
    actorId: string
    capability: MoodleSyncRolloutCapability
    enabled: boolean
    moodleSiteId: string
    userId?: string
  }): Promise<MoodleSyncRolloutRecord>
}

function asRpcClient(supabase: AppSupabaseClient): RolloutRpcClient {
  return supabase as unknown as RolloutRpcClient
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function record(value: unknown): MoodleSyncRolloutRecord {
  if (
    !isRecord(value)
    || !MOODLE_SYNC_ROLLOUT_CAPABILITIES.includes(value.capability as MoodleSyncRolloutCapability)
    || typeof value.enabled !== 'boolean'
    || typeof value.moodle_site_id !== 'string'
    || typeof value.updated_at !== 'string'
    || (value.updated_by !== null && typeof value.updated_by !== 'string')
    || (value.user_id !== null && typeof value.user_id !== 'string')
  ) {
    throw new Error('Invalid Moodle sync rollout response')
  }
  return {
    capability: value.capability as MoodleSyncRolloutCapability,
    enabled: value.enabled,
    moodle_site_id: value.moodle_site_id,
    updated_at: value.updated_at,
    updated_by: value.updated_by,
    user_id: value.user_id,
  }
}

export function createMoodleSyncRolloutsRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): MoodleSyncRolloutsRepository {
  return {
    isApplicationAdmin(actorId) {
      return isApplicationAdmin(supabase, actorId)
    },

    async list(actorId) {
      const { data, error } = await asRpcClient(supabase).rpc('backend_list_moodle_sync_rollouts', {
        p_actor_id: actorId,
      })
      if (error) throw error
      if (!Array.isArray(data)) throw new Error('Invalid Moodle sync rollout list response')
      return data.map(record)
    },

    async set(input) {
      const { data, error } = await asRpcClient(supabase).rpc('backend_set_moodle_sync_rollout', {
        p_actor_id: input.actorId,
        p_capability: input.capability,
        p_enabled: input.enabled,
        p_moodle_site_id: input.moodleSiteId,
        p_user_id: input.userId ?? null,
      })
      if (error) throw error
      return record(data)
    },
  }
}
