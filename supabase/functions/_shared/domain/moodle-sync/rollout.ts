import type { AppSupabaseClient } from '../../db/mod.ts'

export const MOODLE_SYNC_ROLLOUT_CAPABILITIES = [
  'worker',
  'bulk',
  'delta',
  'freshness',
] as const

export type MoodleSyncRolloutCapability = typeof MOODLE_SYNC_ROLLOUT_CAPABILITIES[number]

type RolloutRpcClient = {
  rpc(name: string, parameters: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>
}

function asRolloutRpcClient(supabase: AppSupabaseClient): RolloutRpcClient {
  return supabase as unknown as RolloutRpcClient
}

function readBoolean(value: unknown, operation: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid boolean result returned by ${operation}`)
  }
  return value
}

/**
 * Evaluates a rollout after verifying that the connection belongs to the
 * selected Claris account. Missing controls deliberately resolve to false.
 */
export async function isMoodleSyncConnectionRolloutEnabled(
  supabase: AppSupabaseClient,
  input: {
    capability: MoodleSyncRolloutCapability
    connectionId: string
    userId: string
  },
): Promise<boolean> {
  const { data, error } = await asRolloutRpcClient(supabase).rpc(
    'backend_moodle_sync_connection_rollout_enabled',
    {
      p_capability: input.capability,
      p_moodle_connection_id: input.connectionId,
      p_user_id: input.userId,
    },
  )
  if (error) throw error
  return readBoolean(data, 'Moodle sync connection rollout evaluation')
}

/**
 * Uses the already-validated durable work scope. This is used only inside
 * server workers; browsers never select a site/user pair for rollout checks.
 */
export async function isMoodleSyncRolloutEnabled(
  supabase: AppSupabaseClient,
  input: {
    capability: MoodleSyncRolloutCapability
    siteId: string
    userId: string
  },
): Promise<boolean> {
  const { data, error } = await asRolloutRpcClient(supabase).rpc(
    'backend_moodle_sync_rollout_enabled',
    {
      p_capability: input.capability,
      p_moodle_site_id: input.siteId,
      p_user_id: input.userId,
    },
  )
  if (error) throw error
  return readBoolean(data, 'Moodle sync rollout evaluation')
}
