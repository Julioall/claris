import { userHasPermission as checkPermission } from '../_shared/auth/mod.ts'
import { createServiceClient, type AppSupabaseClient } from '../_shared/db/mod.ts'
import {
  listBulkAudience,
  type BulkAudienceData,
} from '../_shared/domain/bulk-messaging/audience.ts'

export interface BulkMessageAudienceRepository {
  listAudience(actorId: string): Promise<BulkAudienceData>
  userHasPermission(actorId: string, permission: string): Promise<boolean>
}

export function createBulkMessageAudienceRepository(
  db: AppSupabaseClient = createServiceClient(),
): BulkMessageAudienceRepository {
  return {
    listAudience: (actorId) => listBulkAudience(db, actorId),
    userHasPermission: (actorId, permission) => checkPermission(db, actorId, permission),
  }
}
