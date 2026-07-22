import {
  RequestBodyValidationError,
  expectBodyObject,
  readRequiredPositiveInteger,
  readRequiredString,
  readRequiredUuid,
} from '../_shared/http/mod.ts'

export type MessagingPayload =
  | { action: 'get_conversations'; connectionId: string }
  | { action: 'get_messages'; connectionId: string; moodleUserId: number; limit: number }
  | { action: 'send_message'; connectionId: string; moodleUserId: number; message: string }

const ACTION_FIELDS = {
  get_conversations: new Set(['action', 'connectionId']),
  get_messages: new Set(['action', 'connectionId', 'moodleUserId', 'limit']),
  send_message: new Set(['action', 'connectionId', 'moodleUserId', 'message']),
} as const

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

export function parseMessagingPayload(rawBody: unknown): MessagingPayload {
  const body = expectBodyObject(rawBody)
  const action = body.action
  if (action !== 'get_conversations' && action !== 'get_messages' && action !== 'send_message') {
    invalid('Invalid messaging action')
  }

  if (Object.keys(body).some((field) => !ACTION_FIELDS[action].has(field))) {
    invalid('Invalid request fields')
  }

  const connectionId = readRequiredUuid(body, 'connectionId')
  if (action === 'get_conversations') return { action, connectionId }

  const moodleUserId = readRequiredPositiveInteger(body, 'moodleUserId')
  if (action === 'send_message') {
    return {
      action,
      connectionId,
      moodleUserId,
      message: readRequiredString(body, 'message', 4000),
    }
  }

  const limit = body.limit ?? 50
  if (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 100) invalid('Invalid limit')
  return { action, connectionId, moodleUserId, limit: Number(limit) }
}
