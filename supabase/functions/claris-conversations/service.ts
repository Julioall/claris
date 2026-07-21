import { ApiError } from '../_shared/http/mod.ts'
import {
  CLARIS_CONVERSATIONS_CONTRACT_VERSION,
  type ClarisConversationCommandDto,
  type ClarisConversationDeleteDto,
  type ClarisConversationsListDto,
  type ClarisConversationsResponseDto,
} from './contract.ts'
import type { ClarisConversationsPayload } from './payload.ts'
import type { ClarisConversationsRepository } from './repository.ts'

export function authorizeClarisConversations(
  repository: ClarisConversationsRepository,
  actorId: string,
): Promise<boolean> {
  return repository.userCanUseClaris(actorId)
}

export async function executeClarisConversations(
  repository: ClarisConversationsRepository,
  actorId: string,
  payload: ClarisConversationsPayload,
): Promise<ClarisConversationsResponseDto> {
  switch (payload.action) {
    case 'list':
      return {
        contractVersion: CLARIS_CONVERSATIONS_CONTRACT_VERSION,
        items: await repository.list(actorId, payload.limit),
      } satisfies ClarisConversationsListDto
    case 'create':
      return {
        contractVersion: CLARIS_CONVERSATIONS_CONTRACT_VERSION,
        conversation: await repository.create(actorId, payload),
      } satisfies ClarisConversationCommandDto
    case 'update': {
      const conversation = await repository.update(actorId, payload.conversationId, payload)
      if (!conversation) throw ApiError.notFound('Claris conversation not found')
      return {
        contractVersion: CLARIS_CONVERSATIONS_CONTRACT_VERSION,
        conversation,
      } satisfies ClarisConversationCommandDto
    }
    case 'delete': {
      if (!await repository.delete(actorId, payload.conversationId)) {
        throw ApiError.notFound('Claris conversation not found')
      }
      return {
        contractVersion: CLARIS_CONVERSATIONS_CONTRACT_VERSION,
        deleted: true,
      } satisfies ClarisConversationDeleteDto
    }
  }
}
