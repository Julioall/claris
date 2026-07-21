import {
  BULK_MESSAGE_AUDIENCE_CONTRACT_VERSION,
  type BulkMessageAudienceDto,
} from './contract.ts'
import type { BulkMessageAudiencePayload } from './payload.ts'
import type { BulkMessageAudienceRepository } from './repository.ts'

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
  const audience = await repository.listAudience(actorId)
  return {
    ...audience,
    metadata: {
      contractVersion: BULK_MESSAGE_AUDIENCE_CONTRACT_VERSION,
      generatedAt: new Date().toISOString(),
    },
  }
}
