import type { Json } from '../_shared/db/mod.ts'

export const ACTIVITY_FEED_CONTRACT_VERSION = 1 as const

export interface ActivityFeedItemDto {
  createdAt: string | null
  description: string | null
  eventType: string
  id: string
  metadata: Json
  title: string
}

export interface ActivityFeedDto {
  contractVersion: typeof ACTIVITY_FEED_CONTRACT_VERSION
  items: ActivityFeedItemDto[]
}
