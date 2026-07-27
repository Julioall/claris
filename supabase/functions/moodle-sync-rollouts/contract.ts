import type { MoodleSyncRolloutCapability } from '../_shared/domain/moodle-sync/rollout.ts'

export const MOODLE_SYNC_ROLLOUTS_CONTRACT_VERSION = 1 as const

export interface MoodleSyncRolloutDto {
  capability: MoodleSyncRolloutCapability
  enabled: boolean
  moodleSiteId: string
  updatedAt: string
  updatedBy: string | null
  userId: string | null
}
