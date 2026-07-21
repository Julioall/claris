import {
  apiErrorResponse,
  apiSuccessResponse,
} from '../_shared/http/mod.ts'
import { WHATSAPP_MESSAGING_CONTRACT_VERSION } from './contract.ts'
import type { WhatsAppAction } from './payload.ts'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function camelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_match, character: string) => character.toUpperCase())
}

function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize)
  const record = asRecord(value)
  if (!record) return value

  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [camelKey(key), camelize(entry)]),
  )
}

function metadata(): { contractVersion: 1; generatedAt: string } {
  return {
    contractVersion: WHATSAPP_MESSAGING_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
  }
}

function errorCode(status: number): string {
  if (status === 400) return 'invalid_request'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 422) return 'validation_error'
  if (status >= 500) return 'whatsapp_provider_error'
  return 'whatsapp_error'
}

function successData(action: WhatsAppAction, payload: JsonRecord): JsonRecord {
  const common = { metadata: metadata() }
  switch (action) {
    case 'list_instances':
      return { instances: camelize(payload.instances ?? []), ...common }
    case 'get_contacts':
      return { contacts: camelize(payload.contacts ?? []), ...common }
    case 'get_chats':
      return { conversations: camelize(payload.conversations ?? []), ...common }
    case 'get_messages':
      return {
        messages: camelize(payload.messages ?? []),
        remoteJid: payload.remote_jid ?? null,
        ...common,
      }
    case 'send_message':
    case 'send_media':
    case 'send_sticker':
      // The provider's raw response is intentionally not part of the public contract.
      return { message: camelize(payload.message ?? null), ...common }
    case 'resolve_media':
      return { media: camelize(payload.media ?? null), ...common }
  }
}

export async function toWhatsAppApiResponse(
  response: Response,
  action: WhatsAppAction,
  correlationId: string,
): Promise<Response> {
  let payload: JsonRecord | null = null
  try {
    payload = asRecord(await response.json())
  } catch {
    payload = null
  }

  if (!response.ok) {
    const nestedError = asRecord(payload?.error)
    const message = typeof payload?.error === 'string'
      ? payload.error
      : typeof nestedError?.message === 'string'
        ? nestedError.message
        : 'WhatsApp request failed.'
    return apiErrorResponse({ code: errorCode(response.status), message }, response.status, correlationId)
  }

  if (!payload) {
    return apiErrorResponse({
      code: 'invalid_response',
      message: 'WhatsApp provider returned an invalid response.',
    }, 502, correlationId)
  }

  return apiSuccessResponse(successData(action, payload), correlationId)
}
