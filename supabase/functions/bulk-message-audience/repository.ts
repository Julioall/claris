import { userHasPermission as checkPermission } from '../_shared/auth/mod.ts'
import { createServiceClient, type AppSupabaseClient } from '../_shared/db/mod.ts'
import {
  listBulkAudience,
  type BulkAudienceData,
} from '../_shared/domain/bulk-messaging/audience.ts'
import {
  findMoodleSiteById,
  findOwnedMoodleConnection,
} from '../_shared/domain/moodle-connections/repository.ts'

export interface OwnedConnectionScope {
  connectionId: string
  moodleSiteId: string
}

export interface BulkMessageAudienceRepository {
  listAudience(actorId: string, moodleSiteId: string): Promise<BulkAudienceData>
  resolveOwnedConnectionScope(actorId: string, connectionId: string): Promise<OwnedConnectionScope | null>
  userHasPermission(actorId: string, permission: string): Promise<boolean>
}

export function createBulkMessageAudienceRepository(
  db: AppSupabaseClient = createServiceClient(),
): BulkMessageAudienceRepository {
  return {
    listAudience: (actorId, moodleSiteId) => listBulkAudience(db, actorId, moodleSiteId),
    async resolveOwnedConnectionScope(actorId, connectionId) {
      const connection = await findOwnedMoodleConnection(db, actorId, connectionId)
      if (!connection || connection.status !== 'active') return null
      const site = await findMoodleSiteById(db, connection.moodle_site_id)
      if (!site || site.status !== 'approved') return null
      return { connectionId: connection.id, moodleSiteId: site.id }
    },
    userHasPermission: (actorId, permission) => checkPermission(db, actorId, permission),
  }
}
