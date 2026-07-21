import {
  RequestBodyValidationError,
  expectBodyObject,
  isApiV1Request,
  readOptionalPositiveInteger,
  readRequiredLiteral,
  readRequiredMoodleUrl,
  readRequiredPositiveInteger,
  readRequiredString,
} from '../_shared/http/mod.ts'

const LEGACY_MESSAGING_ACTIONS = ['send_message', 'get_conversations', 'get_messages'] as const

interface LegacyMessagingPayloadBase {
  requestVersion: 'legacy'
  moodleUrl: string
  token: string
}

export interface SendMessagePayload extends LegacyMessagingPayloadBase {
  action: 'send_message'
  message: string
  moodleUserId: number
}

export interface GetConversationsPayload extends LegacyMessagingPayloadBase {
  action: 'get_conversations'
}

export interface GetMessagesPayload extends LegacyMessagingPayloadBase {
  action: 'get_messages'
  limitNum?: number
  moodleUserId: number
}

export type LegacyMessagingPayload =
  | SendMessagePayload
  | GetConversationsPayload
  | GetMessagesPayload

export type MessagingV1Payload =
  | { requestVersion: 'v1'; action: 'get_conversations' }
  | { requestVersion: 'v1'; action: 'get_messages'; moodleUserId: number; limit: number }
  | { requestVersion: 'v1'; action: 'send_message'; moodleUserId: number; message: string }

export type MessagingPayload = LegacyMessagingPayload | MessagingV1Payload

const V1_ACTION_FIELDS = {
  get_conversations: new Set(['action']),
  get_messages: new Set(['action', 'moodleUserId', 'limit']),
  send_message: new Set(['action', 'moodleUserId', 'message']),
} as const

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

function parseV1Payload(rawBody: unknown): MessagingV1Payload {
  const body = expectBodyObject(rawBody)
  const action = body.action
  if (action !== 'get_conversations' && action !== 'get_messages' && action !== 'send_message') {
    invalid('Invalid messaging action')
  }

  if (Object.keys(body).some((field) => !V1_ACTION_FIELDS[action].has(field))) {
    invalid('Invalid request fields')
  }

  if (action === 'get_conversations') {
    return { requestVersion: 'v1', action }
  }

  const moodleUserId = readRequiredPositiveInteger(body, 'moodleUserId')
  if (action === 'send_message') {
    return {
      requestVersion: 'v1',
      action,
      moodleUserId,
      message: readRequiredString(body, 'message', 4000),
    }
  }

  const limit = body.limit ?? 50
  if (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 100) {
    invalid('Invalid limit')
  }

  return { requestVersion: 'v1', action, moodleUserId, limit: Number(limit) }
}

function parseLegacyPayload(rawBody: unknown): LegacyMessagingPayload {
  const body = expectBodyObject(rawBody)
  const action = readRequiredLiteral(body, 'action', LEGACY_MESSAGING_ACTIONS)

  const base = {
    requestVersion: 'legacy' as const,
    moodleUrl: readRequiredMoodleUrl(body),
    token: readRequiredString(body, 'token'),
  }

  switch (action) {
    case 'send_message':
      return {
        ...base,
        action,
        message: readRequiredString(body, 'message'),
        moodleUserId: readRequiredPositiveInteger(body, 'moodle_user_id'),
      }
    case 'get_messages':
      return {
        ...base,
        action,
        limitNum: readOptionalPositiveInteger(body, 'limit_num'),
        moodleUserId: readRequiredPositiveInteger(body, 'moodle_user_id'),
      }
    case 'get_conversations':
      return { ...base, action }
  }
}

export function parseMessagingPayload(rawBody: unknown, req: Request): MessagingPayload {
  return isApiV1Request(req) ? parseV1Payload(rawBody) : parseLegacyPayload(rawBody)
}
