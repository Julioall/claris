import { ApiError } from '../_shared/http/mod.ts'
import {
  CLARIS_SUGGESTIONS_CONTRACT_VERSION,
  type ClarisSuggestionActionDto,
  type ClarisSuggestionsListDto,
  type ClarisSuggestionsResponseDto,
} from './contract.ts'
import type { ClarisSuggestionsPayload } from './payload.ts'
import type { ClarisSuggestionsRepository } from './repository.ts'

export function authorizeClarisSuggestions(
  repository: ClarisSuggestionsRepository,
  actorId: string,
): Promise<boolean> {
  return repository.userCanUseClaris(actorId)
}

export async function executeClarisSuggestions(
  repository: ClarisSuggestionsRepository,
  actorId: string,
  payload: ClarisSuggestionsPayload,
): Promise<ClarisSuggestionsResponseDto> {
  if (payload.action === 'list_pending') {
    return {
      contractVersion: CLARIS_SUGGESTIONS_CONTRACT_VERSION,
      items: await repository.listPending(actorId, payload.limit),
    } satisfies ClarisSuggestionsListDto
  }

  const result = await repository.act(
    actorId,
    payload.suggestionId,
    payload.action === 'accept' ? 'accepted' : 'dismissed',
  )
  if (result.kind === 'not_found') throw ApiError.notFound('Claris suggestion not found')
  if (result.kind === 'not_actionable') {
    throw ApiError.conflict('Claris suggestion is no longer actionable')
  }
  if (result.kind === 'invalid_action_payload') {
    throw ApiError.conflict('Claris suggestion action is invalid')
  }

  return {
    actionType: result.actionType,
    contractVersion: CLARIS_SUGGESTIONS_CONTRACT_VERSION,
    createdEntityId: result.createdEntityId,
    effect: result.effect,
    status: result.status,
    suggestionId: result.suggestionId,
  } satisfies ClarisSuggestionActionDto
}
