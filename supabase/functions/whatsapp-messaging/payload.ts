import {
  expectBodyObject,
  readOptionalBoolean,
  readOptionalLiteral,
  readOptionalPositiveInteger,
  readOptionalString,
  readRequiredLiteral,
  readRequiredString,
  RequestBodyValidationError,
} from '../_shared/http/mod.ts'

export const WHATSAPP_ACTIONS = [
  'list_instances',
  'get_contacts',
  'get_chats',
  'get_messages',
  'send_message',
  'send_media',
  'send_sticker',
  'resolve_media',
] as const

const OUTGOING_MEDIA_TYPES = ['image', 'video', 'audio', 'document'] as const
export const MAX_MEDIA_PAYLOAD_SIZE = 50_000_000

export type WhatsAppAction = (typeof WHATSAPP_ACTIONS)[number]
export type OutgoingMediaType = (typeof OUTGOING_MEDIA_TYPES)[number]

/** Internal command after the public camelCase contract has been validated. */
export interface WhatsAppMessagingCommand {
  action: WhatsAppAction
  caption?: string
  convert_to_mp4?: boolean
  file_name?: string
  instance_id?: string
  limit?: number
  media?: string
  media_type?: OutgoingMediaType
  message?: string
  message_id?: string
  mime_type?: string
  remote_jid?: string
}

const ACTION_FIELDS: Record<WhatsAppAction, readonly string[]> = {
  list_instances: ['action'],
  get_contacts: ['action', 'instanceId'],
  get_chats: ['action', 'instanceId'],
  get_messages: ['action', 'instanceId', 'limit', 'remoteJid'],
  send_message: ['action', 'instanceId', 'message', 'remoteJid'],
  send_media: [
    'action',
    'caption',
    'fileName',
    'instanceId',
    'media',
    'mediaType',
    'mimeType',
    'remoteJid',
  ],
  send_sticker: ['action', 'fileName', 'instanceId', 'media', 'mimeType', 'remoteJid'],
  resolve_media: [
    'action',
    'convertToMp4',
    'fileName',
    'instanceId',
    'messageId',
    'mimeType',
    'remoteJid',
  ],
}

function exactFields(body: Record<string, unknown>, action: WhatsAppAction): void {
  const allowed = new Set(ACTION_FIELDS[action])
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    throw new RequestBodyValidationError('Invalid request fields', 422)
  }
}

function requiredInstance(body: Record<string, unknown>, action: WhatsAppAction): string | undefined {
  return action === 'list_instances'
    ? undefined
    : readRequiredString(body, 'instanceId', 128)
}

function requiresRemoteJid(action: WhatsAppAction): boolean {
  return ['get_messages', 'send_message', 'send_media', 'send_sticker'].includes(action)
}

export function parseWhatsAppMessagingPayload(rawBody: unknown): WhatsAppMessagingCommand {
  const body = expectBodyObject(rawBody)
  const action = readRequiredLiteral(body, 'action', WHATSAPP_ACTIONS)
  exactFields(body, action)

  const instanceId = requiredInstance(body, action)
  const remoteJid = requiresRemoteJid(action)
    ? readRequiredString(body, 'remoteJid', 256)
    : readOptionalString(body, 'remoteJid', 256)

  return {
    action,
    ...(instanceId ? { instance_id: instanceId } : {}),
    ...(remoteJid ? { remote_jid: remoteJid } : {}),
    message: action === 'send_message'
      ? readRequiredString(body, 'message', 4096)
      : undefined,
    limit: action === 'get_messages'
      ? readOptionalPositiveInteger(body, 'limit')
      : undefined,
    media: action === 'send_media' || action === 'send_sticker'
      ? readRequiredString(body, 'media', MAX_MEDIA_PAYLOAD_SIZE)
      : undefined,
    media_type: action === 'send_media'
      ? readOptionalLiteral(body, 'mediaType', OUTGOING_MEDIA_TYPES)
      : undefined,
    mime_type: action === 'send_media' || action === 'send_sticker' || action === 'resolve_media'
      ? readOptionalString(body, 'mimeType', 256)
      : undefined,
    file_name: action === 'send_media' || action === 'send_sticker' || action === 'resolve_media'
      ? readOptionalString(body, 'fileName', 512)
      : undefined,
    caption: action === 'send_media'
      ? readOptionalString(body, 'caption', 2048)
      : undefined,
    message_id: action === 'resolve_media'
      ? readRequiredString(body, 'messageId', 256)
      : undefined,
    convert_to_mp4: action === 'resolve_media'
      ? readOptionalBoolean(body, 'convertToMp4')
      : undefined,
  }
}
