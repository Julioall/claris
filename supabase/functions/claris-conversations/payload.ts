import {
  RequestBodyValidationError,
  expectBodyObject,
} from '../_shared/http/mod.ts'
import { validateUuid } from '../_shared/validation/mod.ts'
import type { ClarisConversationMessageDto } from './contract.ts'

type ConversationFields = {
  lastContextRoute?: string | null
  messages?: ClarisConversationMessageDto[]
  title?: string
}

export type ClarisConversationsPayload =
  | { action: 'list'; limit: number }
  | ({ action: 'create' } & Required<ConversationFields>)
  | ({ action: 'update'; conversationId: string } & ConversationFields)
  | { action: 'delete'; conversationId: string }

const ACTION_FIELDS = {
  list: new Set(['action', 'limit']),
  create: new Set(['action', 'title', 'messages', 'lastContextRoute']),
  update: new Set(['action', 'conversationId', 'title', 'messages', 'lastContextRoute']),
  delete: new Set(['action', 'conversationId']),
} as const

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

function hasOwn(body: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, field)
}

function assertExactFields(
  body: Record<string, unknown>,
  action: keyof typeof ACTION_FIELDS,
): void {
  if (Object.keys(body).some((field) => !ACTION_FIELDS[action].has(field))) {
    invalid('Invalid request fields')
  }
}

function readUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !validateUuid(value)) invalid(`Invalid ${field}`)
  return value.toLowerCase()
}

function readTitle(value: unknown): string {
  if (typeof value !== 'string') invalid('Invalid title')
  const title = value.trim()
  if (title.length < 1 || title.length > 160) invalid('Invalid title')
  return title
}

function readRoute(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') invalid('Invalid lastContextRoute')
  const route = value.trim()
  if (route.length > 500) invalid('Invalid lastContextRoute')
  return route || null
}

function readMessages(value: unknown): ClarisConversationMessageDto[] {
  if (!Array.isArray(value) || value.length > 40) invalid('Invalid messages')

  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid('Invalid messages')
    const message = item as Record<string, unknown>
    if (Object.keys(message).some((field) => !['role', 'content', 'richBlocks'].includes(field))) {
      invalid('Invalid messages')
    }
    if (message.role !== 'assistant' && message.role !== 'user') invalid('Invalid messages')
    if (typeof message.content !== 'string' || message.content.length > 8_000) invalid('Invalid messages')
    if (hasOwn(message, 'richBlocks') && !Array.isArray(message.richBlocks)) invalid('Invalid messages')

    return {
      content: message.content,
      ...(Array.isArray(message.richBlocks) ? { richBlocks: message.richBlocks } : {}),
      role: message.role,
    } as ClarisConversationMessageDto
  })
}

export function parseClarisConversationsPayload(raw: unknown): ClarisConversationsPayload {
  const body = expectBodyObject(raw)
  const action = body.action
  if (action !== 'list' && action !== 'create' && action !== 'update' && action !== 'delete') {
    invalid('Invalid action')
  }
  assertExactFields(body, action)

  switch (action) {
    case 'list': {
      const limit = body.limit ?? 30
      if (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 50) {
        invalid('Invalid limit')
      }
      return { action, limit: Number(limit) }
    }
    case 'create':
      return {
        action,
        lastContextRoute: readRoute(body.lastContextRoute),
        messages: readMessages(body.messages),
        title: readTitle(body.title),
      }
    case 'update': {
      const fields: ConversationFields = {}
      if (hasOwn(body, 'title')) fields.title = readTitle(body.title)
      if (hasOwn(body, 'messages')) fields.messages = readMessages(body.messages)
      if (hasOwn(body, 'lastContextRoute')) fields.lastContextRoute = readRoute(body.lastContextRoute)
      if (Object.keys(fields).length === 0) invalid('At least one update field is required')
      return {
        action,
        conversationId: readUuid(body.conversationId, 'conversationId'),
        ...fields,
      }
    }
    case 'delete':
      return {
        action,
        conversationId: readUuid(body.conversationId, 'conversationId'),
      }
  }
}
