import {
  BULK_MESSAGE_AUDIENCE_CONTRACT_VERSION,
  type BulkMessageAudienceDto,
} from './contract.ts'
import type { BulkMessageAudiencePayload } from './payload.ts'
import type { BulkMessageAudienceRepository } from './repository.ts'
import { ApiError } from '../_shared/http/mod.ts'

export const BULK_MESSAGE_AUDIENCE_PERMISSION = 'messages.bulk_send'

export function authorizeBulkMessageAudience(
  repository: BulkMessageAudienceRepository,
  actorId: string,
  _payload: BulkMessageAudiencePayload,
): Promise<boolean> {
  return repository.userHasPermission(actorId, BULK_MESSAGE_AUDIENCE_PERMISSION)
}

export async function executeBulkMessageAudience(
  repository: BulkMessageAudienceRepository,
  actorId: string,
  _payload: BulkMessageAudiencePayload,
): Promise<BulkMessageAudienceDto> {
  const scope = await repository.resolveOwnedConnectionScope(actorId, _payload.connectionId)
  if (!scope) throw ApiError.forbidden('Moodle connection is not available to this user.')
  const audience = await repository.listAudience(actorId, scope.moodleSiteId)
  return {
    ...audience,
    connectionId: scope.connectionId,
    moodleSiteId: scope.moodleSiteId,
    metadata: {
      contractVersion: BULK_MESSAGE_AUDIENCE_CONTRACT_VERSION,
      generatedAt: new Date().toISOString(),
    },
  }
}
