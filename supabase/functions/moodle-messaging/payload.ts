import {
  expectBodyObject,
  readOptionalLiteral,
  readOptionalPositiveInteger,
  readRequiredLiteral,
  readRequiredMoodleUrl,
  readRequiredPositiveInteger,
  readRequiredString,
} from '../_shared/http/mod.ts'

const MESSAGING_ACTIONS = ['send_message', 'get_conversations', 'get_messages'] as const

type MessagingAction = typeof MESSAGING_ACTIONS[number]

interface MessagingPayloadBase {
  action: MessagingAction
  moodleUrl: string
  token: string
}

export interface SendMessagePayload extends MessagingPayloadBase {
  action: 'send_message'
  message: string
  moodleUserId: number
}

export interface GetConversationsPayload extends MessagingPayloadBase {
  action: 'get_conversations'
}

export interface GetMessagesPayload extends MessagingPayloadBase {
  action: 'get_messages'
  limitNum?: number
  moodleUserId: number
}

export type MessagingPayload = SendMessagePayload | GetConversationsPayload | GetMessagesPayload

export function parseMessagingPayload(rawBody: unknown): MessagingPayload {
  const body = expectBodyObject(rawBody)
  const action = readRequiredLiteral(body, 'action', MESSAGING_ACTIONS)

  const base = {
    action,
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
      return {
        ...base,
        action,
      }
  }
}