import { ApiError } from '../_shared/http/mod.ts'
import {
  MOODLE_SYNC_ROLLOUTS_CONTRACT_VERSION,
  type MoodleSyncRolloutDto,
} from './contract.ts'
import type { MoodleSyncRolloutsPayload } from './payload.ts'
import type { MoodleSyncRolloutRecord, MoodleSyncRolloutsRepository } from './repository.ts'

function mapRecord(row: MoodleSyncRolloutRecord): MoodleSyncRolloutDto {
  return {
    capability: row.capability,
    enabled: row.enabled,
    moodleSiteId: row.moodle_site_id,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    userId: row.user_id,
  }
}

export async function executeMoodleSyncRollouts(
  repository: MoodleSyncRolloutsRepository,
  actorId: string,
  payload: MoodleSyncRolloutsPayload,
): Promise<{ contractVersion: number; items?: MoodleSyncRolloutDto[]; item?: MoodleSyncRolloutDto }> {
  if (!await repository.isApplicationAdmin(actorId)) {
    throw ApiError.forbidden('Admin access required.')
  }
  if (payload.action === 'list_rollouts') {
    return {
      contractVersion: MOODLE_SYNC_ROLLOUTS_CONTRACT_VERSION,
      items: (await repository.list(actorId)).map(mapRecord),
    }
  }
  return {
    contractVersion: MOODLE_SYNC_ROLLOUTS_CONTRACT_VERSION,
    item: mapRecord(await repository.set({ actorId, ...payload })),
  }
}
