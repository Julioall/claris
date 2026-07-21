import {
  ACTIVITY_FEED_CONTRACT_VERSION,
  type ActivityFeedDto,
} from './contract.ts'
import type { ActivityFeedPayload } from './payload.ts'
import type { ActivityFeedRepository } from './repository.ts'

export async function getActivityFeed(
  repository: ActivityFeedRepository,
  actorId: string,
  payload: ActivityFeedPayload,
): Promise<ActivityFeedDto> {
  return {
    contractVersion: ACTIVITY_FEED_CONTRACT_VERSION,
    items: await repository.listForActor(actorId, payload.limit),
  }
}
