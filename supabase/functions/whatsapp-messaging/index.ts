// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import {
  createHandler,
  errorResponse,
  expectBodyObject,
  jsonResponse,
  RequestBodyValidationError,
  readOptionalLiteral,
  readOptionalPositiveInteger,
  readOptionalString,
  readRequiredLiteral,
  readRequiredString,
} from '../_shared/http/mod.ts'
import type { AuthenticatedHandlerContext } from '../_shared/http/mod.ts'
import { userHasPermission } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import {
  isPhoneLikeConversationName,
  isSelfConversationName,
  normalizePhone,
  remoteJidToPhone,
  resolveConversationName,
} from '../_shared/whatsapp/normalization.ts'
import { evolutionRequest as requestEvolutionApi } from '../_shared/whatsapp/evolution.ts'

const ACTIONS = [
  'get_contacts',
  'get_chats',
  'get_messages',
  'send_message',
  'send_media',
  'send_sticker',
  'resolve_media',
] as const

const OUTGOING_MEDIA_TYPES = ['image', 'video', 'audio', 'document'] as const
const MAX_MEDIA_PAYLOAD_SIZE = 50_000_000

type Action = (typeof ACTIONS)[number]
type OutgoingMediaType = (typeof OUTGOING_MEDIA_TYPES)[number]
type JsonRecord = Record<string, unknown>
type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'contact'
  | 'location'
  | 'unknown'

interface RequestBody {
  action: Action
  instance_id?: string
  remote_jid?: string
  message?: string
  limit?: number
  media?: string
  media_type?: OutgoingMediaType
  mime_type?: string
  file_name?: string
  caption?: string
  message_id?: string
  convert_to_mp4?: boolean
}

interface AccessibleInstance {
  id: string
  name: string
  scope: 'personal' | 'shared'
  owner_user_id: string | null
  service_type: string
  evolution_instance_name: string | null
  connection_status: string
  is_active: boolean
  is_blocked: boolean
}

interface NormalizedContact {
  id: string
  remote_jid: string
  name: string
  short_name: string
  phone: string | null
  profile_picture_url: string | null
  is_business: boolean
  updated_at: string | null
}

interface NormalizedConversation {
  id: string
  remote_jid: string
  name: string
  phone: string | null
  unread_count: number
  last_message_text: string
  last_message_at: string | null
  is_group: boolean
  profile_picture_url: string | null
}

interface NormalizedMedia {
  media_type: Exclude<MessageType, 'text' | 'contact' | 'location' | 'unknown'>
  mime_type: string | null
  file_name: string | null
  caption: string | null
  url: string | null
  direct_path: string | null
  preview_data_url: string | null
  file_size_bytes: number | null
  duration_seconds: number | null
  width: number | null
  height: number | null
  is_voice_note: boolean
  is_animated: boolean
  requires_resolve: boolean
}

interface NormalizedContactCard {
  display_name: string | null
  phone_numbers: string[]
  emails: string[]
  urls: string[]
  organization: string | null
  vcard: string | null
}

interface NormalizedLocation {
  latitude: number | null
  longitude: number | null
  name: string | null
  address: string | null
  url: string | null
}

interface NormalizedMessage {
  id: string
  remote_jid: string
  text: string
  sent_at: string | null
  direction: 'incoming' | 'outgoing'
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'error'
  type: MessageType
  media: NormalizedMedia | null
  contact: NormalizedContactCard | null
  location: NormalizedLocation | null
  sender_name: string | null
}

interface MessageDescriptor {
  type: MessageType
  text: string | null
  media: NormalizedMedia | null
  contact: NormalizedContactCard | null
  location: NormalizedLocation | null
}

function readOptionalBoolean(body: JsonRecord, fieldName: string): boolean | undefined {
  const value = body[fieldName]
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }

  throw new RequestBodyValidationError(`Invalid ${fieldName}`)
}

function parseBody(rawBody: unknown): RequestBody {
  const body = expectBodyObject(rawBody)
  const action = readRequiredLiteral(body, 'action', ACTIONS)

  return {
    action,
    instance_id: readOptionalString(body, 'instance_id', 128),
    remote_jid: readOptionalString(body, 'remote_jid', 256),
    message: action === 'send_message'
      ? readRequiredString(body, 'message', 4096)
      : readOptionalString(body, 'message', 4096),
    limit: readOptionalPositiveInteger(body, 'limit'),
    media: action === 'send_media' || action === 'send_sticker'
      ? readRequiredString(body, 'media', MAX_MEDIA_PAYLOAD_SIZE)
      : readOptionalString(body, 'media', MAX_MEDIA_PAYLOAD_SIZE),
    media_type: readOptionalLiteral(body, 'media_type', OUTGOING_MEDIA_TYPES),
    mime_type: readOptionalString(body, 'mime_type', 256),
    file_name: readOptionalString(body, 'file_name', 512),
    caption: readOptionalString(body, 'caption', 2048),
    message_id: action === 'resolve_media'
      ? readRequiredString(body, 'message_id', 256)
      : readOptionalString(body, 'message_id', 256),
    convert_to_mp4: readOptionalBoolean(body, 'convert_to_mp4'),
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function getNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null

    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function getBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }

  return null
}

function getNestedValue(value: unknown, path: string[]): unknown {
  let current: unknown = value
  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined
    }

    current = current[segment]
  }

  return current
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = getString(value)
    if (text) return text
  }

  return null
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const num = getNumber(value)
    if (num !== null) return num
  }

  return null
}

function firstBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    const current = getBoolean(value)
    if (current !== null) return current
  }

  return null
}

function firstRecord(...values: unknown[]): JsonRecord | null {
  for (const value of values) {
    if (isRecord(value)) return value
  }

  return null
}

function toIsoDate(value: unknown): string | null {
  const numericValue = getNumber(value)
  if (numericValue !== null) {
    const milliseconds = numericValue > 1_000_000_000_000 ? numericValue : numericValue * 1000
    const date = new Date(milliseconds)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  const textValue = getString(value)
  if (!textValue) return null

  const date = new Date(textValue)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function normalizeRemoteJid(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.includes('@')) return trimmed

  const phone = normalizePhone(trimmed)
  return phone ? `${phone}@s.whatsapp.net` : trimmed
}

function isStatusChat(remoteJid: string): boolean {
  return remoteJid === 'status@broadcast'
}

function isGroupChat(remoteJid: string): boolean {
  return remoteJid.endsWith('@g.us')
}

function normalizeText(text: string | null, fallback = 'Mensagem sem texto'): string {
  if (!text) return fallback

  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized || fallback
}

function getMessageTypeLabel(type: MessageType): string {
  switch (type) {
    case 'image':
      return 'Imagem'
    case 'video':
      return 'Video'
    case 'audio':
      return 'Audio'
    case 'document':
      return 'Documento'
    case 'sticker':
      return 'Figurinha'
    case 'contact':
      return 'Contato'
    case 'location':
      return 'Localizacao'
    default:
      return 'Mensagem'
  }
}

function buildDataUrl(base64Payload: string | null, mimeType: string | null): string | null {
  if (!base64Payload) return null
  return `data:${mimeType ?? 'application/octet-stream'};base64,${base64Payload}`
}

function isBrowserRenderableMediaUrl(value: string | null): boolean {
  if (!value) return false

  return value.startsWith('data:') || /^https?:\/\//i.test(value)
}

function isTransientMediaUrl(value: string | null): boolean {
  if (!value) return true
  if (value.startsWith('data:')) return false
  if (!/^https?:\/\//i.test(value)) return true

  try {
    const parsed = new URL(value)
    const hostname = parsed.hostname.toLowerCase()

    return (
      hostname === 'mmg.whatsapp.net' ||
      hostname.endsWith('.mmg.whatsapp.net') ||
      parsed.pathname.endsWith('.enc') ||
      parsed.searchParams.get('mms3') === 'true'
    )
  } catch {
    return true
  }
}

function sanitizeBase64Payload(value: string | undefined): string | null {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const [, base64Payload] = trimmed.split(',', 2)
  return base64Payload ?? trimmed
}

function sanitizeFileName(value: string | undefined, fallback: string): string {
  const raw = value?.trim() ?? ''
  if (!raw) return fallback

  return raw.replace(/[\\/]+/g, '_')
}

function inferOutgoingMediaType(
  requestedType: OutgoingMediaType | undefined,
  mimeType: string | undefined,
): OutgoingMediaType {
  if (requestedType) return requestedType

  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.startsWith('video/')) return 'video'
  if (mimeType?.startsWith('audio/')) return 'audio'

  return 'document'
}

function normalizeMessageStatus(value: unknown): NormalizedMessage['status'] {
  const status = getString(value)?.toUpperCase()
  if (!status) return undefined

  if (status.includes('READ')) return 'read'
  if (status.includes('DELIVER')) return 'delivered'
  if (status.includes('ERROR') || status.includes('FAIL')) return 'error'
  if (status.includes('PENDING')) return 'pending'
  if (status.includes('ACK') || status.includes('SENT')) return 'sent'

  return undefined
}

function extractItemsFromResponse(
  payload: unknown,
  keys: string[] = ['messages', 'chats', 'contacts', 'data', 'result'],
): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!isRecord(payload)) return []

  for (const key of keys) {
    const value = payload[key]
    if (Array.isArray(value)) return value
    if (isRecord(value)) {
      const nested = extractItemsFromResponse(value, keys)
      if (nested.length > 0) return nested
    }
  }

  const firstArray = Object.values(payload).find(Array.isArray)
  return Array.isArray(firstArray) ? firstArray : []
}

function resolveDisplayName(
  rawEntity: unknown,
  remoteJid: string,
  extraCandidates: unknown[] = [],
): string {
  const phone = remoteJidToPhone(remoteJid)
  const fallbackName = phone ? `+${phone}` : remoteJid

  if (!isRecord(rawEntity)) {
    return fallbackName
  }

  const preferredCandidates = [
    ...extraCandidates,
    rawEntity.name,
    rawEntity.subject,
    rawEntity.short,
    rawEntity.pushName,
    rawEntity.notify,
    rawEntity.verifiedName,
    rawEntity.profileName,
    getNestedValue(rawEntity, ['contact', 'name']),
    getNestedValue(rawEntity, ['contact', 'pushName']),
    getNestedValue(rawEntity, ['lastMessage', 'pushName']),
  ]

  for (const candidate of preferredCandidates) {
    const text = getString(candidate)
    if (!text) continue
    if (isSelfConversationName(text)) continue
    if (isPhoneLikeConversationName(text, phone)) continue

    return text
  }

  return fallbackName
}

function extractMessageNode(message: unknown): JsonRecord | null {
  const initialNode = firstRecord(
    getNestedValue(message, ['message']),
    getNestedValue(message, ['ephemeralMessage', 'message']),
    getNestedValue(message, ['viewOnceMessage', 'message']),
    getNestedValue(message, ['viewOnceMessageV2', 'message']),
    getNestedValue(message, ['viewOnceMessageV2Extension', 'message']),
    getNestedValue(message, ['documentWithCaptionMessage', 'message']),
    getNestedValue(message, ['editedMessage', 'message']),
    getNestedValue(message, ['protocolMessage', 'editedMessage']),
    getNestedValue(message, ['keepInChatMessage', 'message']),
    message,
  )

  if (!initialNode) return null

  let current = initialNode
  let previousJson = ''

  while (true) {
    const currentJson = JSON.stringify(current)
    if (currentJson === previousJson) {
      return current
    }

    previousJson = currentJson
    const nestedNode = firstRecord(
      getNestedValue(current, ['message']),
      getNestedValue(current, ['ephemeralMessage', 'message']),
      getNestedValue(current, ['viewOnceMessage', 'message']),
      getNestedValue(current, ['viewOnceMessageV2', 'message']),
      getNestedValue(current, ['viewOnceMessageV2Extension', 'message']),
      getNestedValue(current, ['documentWithCaptionMessage', 'message']),
      getNestedValue(current, ['editedMessage', 'message']),
      getNestedValue(current, ['protocolMessage', 'editedMessage']),
      getNestedValue(current, ['keepInChatMessage', 'message']),
    )

    if (!nestedNode) {
      return current
    }

    current = nestedNode
  }
}

function normalizeMediaPayload(
  mediaType: NormalizedMedia['media_type'],
  payload: JsonRecord,
): NormalizedMedia {
  const jpegThumbnail = getString(payload.jpegThumbnail)
  const pngThumbnail = getString(payload.pngThumbnail)
  const rawUrl = firstString(payload.url, payload.mediaUrl, payload.media)
  const browserUrl = isBrowserRenderableMediaUrl(rawUrl) ? rawUrl : null

  return {
    media_type: mediaType,
    mime_type: firstString(payload.mimetype, payload.mimeType),
    file_name: firstString(payload.fileName, payload.title, payload.fileSha256),
    caption: firstString(payload.caption),
    url: browserUrl,
    direct_path: firstString(payload.directPath),
    preview_data_url: buildDataUrl(
      jpegThumbnail ?? pngThumbnail,
      jpegThumbnail ? 'image/jpeg' : pngThumbnail ? 'image/png' : null,
    ),
    file_size_bytes: firstNumber(payload.fileLength, payload.fileSize, payload.size),
    duration_seconds: firstNumber(payload.seconds, payload.duration, payload.durationSeconds),
    width: firstNumber(payload.width),
    height: firstNumber(payload.height),
    is_voice_note: firstBoolean(payload.ptt, payload.isPtt) ?? false,
    is_animated: firstBoolean(payload.isAnimated, payload.animatedSticker) ?? false,
    requires_resolve: !browserUrl || isTransientMediaUrl(browserUrl),
  }
}

function decodeVcardValue(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .trim()
}

function extractVcardValues(vcard: string | null, fieldName: string): string[] {
  if (!vcard) return []

  const pattern = new RegExp(`^${fieldName}(?:;[^:]*)?:(.+)$`, 'gim')
  const values: string[] = []
  let currentMatch = pattern.exec(vcard)

  while (currentMatch) {
    const value = decodeVcardValue(currentMatch[1] ?? '')
    if (value) values.push(value)
    currentMatch = pattern.exec(vcard)
  }

  return values
}

function normalizeContactCardPayload(payload: JsonRecord): NormalizedContactCard {
  const vcard = firstString(payload.vcard)
  const phoneValues = [
    ...extractVcardValues(vcard, 'TEL'),
    firstString(payload.phoneNumber),
  ].filter((value): value is string => !!value)

  const emailValues = [
    ...extractVcardValues(vcard, 'EMAIL'),
    firstString(payload.email),
  ].filter((value): value is string => !!value)

  const urlValues = [
    ...extractVcardValues(vcard, 'URL'),
    firstString(payload.url),
  ].filter((value): value is string => !!value)

  return {
    display_name: firstString(
      payload.displayName,
      payload.name,
      payload.fullName,
      extractVcardValues(vcard, 'FN')[0],
    ),
    phone_numbers: [...new Set(phoneValues)],
    emails: [...new Set(emailValues)],
    urls: [...new Set(urlValues)],
    organization: firstString(payload.organization, extractVcardValues(vcard, 'ORG')[0]),
    vcard,
  }
}

function normalizeLocationPayload(payload: JsonRecord): NormalizedLocation {
  const latitude = firstNumber(
    payload.degreesLatitude,
    payload.latitude,
    payload.lat,
  )
  const longitude = firstNumber(
    payload.degreesLongitude,
    payload.longitude,
    payload.lng,
  )

  return {
    latitude,
    longitude,
    name: firstString(payload.name),
    address: firstString(payload.address, payload.comment),
    url: latitude !== null && longitude !== null
      ? `https://maps.google.com/?q=${latitude},${longitude}`
      : null,
  }
}

function describeMessageContent(message: unknown): MessageDescriptor {
  const node = extractMessageNode(message)
  if (!node) {
    return {
      type: 'unknown',
      text: null,
      media: null,
      contact: null,
      location: null,
    }
  }

  const imageMessage = firstRecord(node.imageMessage)
  if (imageMessage) {
    return {
      type: 'image',
      text: firstString(imageMessage.caption),
      media: normalizeMediaPayload('image', imageMessage),
      contact: null,
      location: null,
    }
  }

  const videoMessage = firstRecord(node.videoMessage)
  if (videoMessage) {
    return {
      type: 'video',
      text: firstString(videoMessage.caption),
      media: normalizeMediaPayload('video', videoMessage),
      contact: null,
      location: null,
    }
  }

  const audioMessage = firstRecord(node.audioMessage)
  if (audioMessage) {
    return {
      type: 'audio',
      text: null,
      media: normalizeMediaPayload('audio', audioMessage),
      contact: null,
      location: null,
    }
  }

  const documentMessage = firstRecord(node.documentMessage)
  if (documentMessage) {
    return {
      type: 'document',
      text: firstString(documentMessage.caption),
      media: normalizeMediaPayload('document', documentMessage),
      contact: null,
      location: null,
    }
  }

  const stickerMessage = firstRecord(node.stickerMessage)
  if (stickerMessage) {
    return {
      type: 'sticker',
      text: null,
      media: normalizeMediaPayload('sticker', stickerMessage),
      contact: null,
      location: null,
    }
  }

  const contactsArrayMessage = firstRecord(node.contactsArrayMessage)
  if (contactsArrayMessage) {
    const firstContact = Array.isArray(contactsArrayMessage.contacts)
      ? firstRecord(contactsArrayMessage.contacts[0])
      : null

    const contact = normalizeContactCardPayload({
      ...contactsArrayMessage,
      ...(firstContact ?? {}),
    })

    return {
      type: 'contact',
      text: contact.display_name,
      media: null,
      contact,
      location: null,
    }
  }

  const contactMessage = firstRecord(node.contactMessage)
  if (contactMessage) {
    const contact = normalizeContactCardPayload(contactMessage)
    return {
      type: 'contact',
      text: contact.display_name,
      media: null,
      contact,
      location: null,
    }
  }

  const liveLocationMessage = firstRecord(node.liveLocationMessage)
  if (liveLocationMessage) {
    const location = normalizeLocationPayload(liveLocationMessage)
    return {
      type: 'location',
      text: firstString(location.name, location.address),
      media: null,
      contact: null,
      location,
    }
  }

  const locationMessage = firstRecord(node.locationMessage)
  if (locationMessage) {
    const location = normalizeLocationPayload(locationMessage)
    return {
      type: 'location',
      text: firstString(location.name, location.address),
      media: null,
      contact: null,
      location,
    }
  }

  const text = firstString(
    node.conversation,
    getNestedValue(node, ['extendedTextMessage', 'text']),
    getNestedValue(node, ['buttonsResponseMessage', 'selectedDisplayText']),
    getNestedValue(node, ['listResponseMessage', 'title']),
    getNestedValue(node, ['templateButtonReplyMessage', 'selectedDisplayText']),
    getNestedValue(node, ['reactionMessage', 'text']),
  )

  return {
    type: text ? 'text' : 'unknown',
    text,
    media: null,
    contact: null,
    location: null,
  }
}

function normalizeConversation(rawConversation: unknown): NormalizedConversation | null {
  if (!isRecord(rawConversation)) return null

  const remoteJid = firstString(
    rawConversation.remoteJid,
    rawConversation.id,
    rawConversation.jid,
    getNestedValue(rawConversation, ['key', 'remoteJid']),
  )

  if (!remoteJid || isStatusChat(remoteJid)) {
    return null
  }

  const phone = remoteJidToPhone(remoteJid)
  const lastMessageDescriptor = describeMessageContent(
    firstRecord(rawConversation.lastMessage, rawConversation.message) ?? rawConversation.lastMessage,
  )

  const lastMessageText = normalizeText(
    firstString(
      rawConversation.lastMessage,
      lastMessageDescriptor.text,
    ),
    lastMessageDescriptor.type === 'unknown'
      ? 'Sem mensagens'
      : getMessageTypeLabel(lastMessageDescriptor.type),
  )

  const lastMessageAt = toIsoDate(firstNumber(
    rawConversation.conversationTimestamp,
    rawConversation.lastMessageTimestamp,
    getNestedValue(rawConversation, ['lastMessage', 'messageTimestamp']),
    rawConversation.updatedAt,
  ))

  const unreadCount = firstNumber(
    rawConversation.unreadCount,
    rawConversation.unreadMessages,
    rawConversation.unread,
  ) ?? 0

  return {
    id: remoteJid,
    remote_jid: remoteJid,
    name: resolveConversationName(rawConversation, remoteJid),
    phone: phone ? `+${phone}` : null,
    unread_count: unreadCount,
    last_message_text: lastMessageText,
    last_message_at: lastMessageAt,
    is_group: isGroupChat(remoteJid),
    profile_picture_url: firstString(
      rawConversation.profilePictureUrl,
      rawConversation.pictureUrl,
      getNestedValue(rawConversation, ['contact', 'profilePictureUrl']),
    ),
  }
}

function normalizeContact(rawContact: unknown): NormalizedContact | null {
  if (!isRecord(rawContact)) return null

  const remoteJid = normalizeRemoteJid(firstString(
    rawContact.id,
    rawContact.remoteJid,
    rawContact.wuid,
    rawContact.jid,
  ) ?? '')

  if (!remoteJid || isStatusChat(remoteJid) || isGroupChat(remoteJid)) {
    return null
  }

  const resolvedName = resolveDisplayName(rawContact, remoteJid)

  return {
    id: remoteJid,
    remote_jid: remoteJid,
    name: resolvedName,
    short_name: firstString(rawContact.short, rawContact.pushName, resolvedName) ?? resolvedName,
    phone: remoteJidToPhone(remoteJid) ? `+${remoteJidToPhone(remoteJid)}` : null,
    profile_picture_url: firstString(
      rawContact.profilePictureUrl,
      rawContact.pictureUrl,
    ),
    is_business: firstBoolean(rawContact.isBusiness, rawContact.verifiedName) ?? false,
    updated_at: toIsoDate(firstString(rawContact.updatedAt, rawContact.lastUpdate)),
  }
}

function normalizeMessage(rawMessage: unknown): NormalizedMessage | null {
  if (!isRecord(rawMessage)) return null

  const remoteJid = normalizeRemoteJid(firstString(
    rawMessage.remoteJid,
    getNestedValue(rawMessage, ['key', 'remoteJid']),
  ) ?? '')

  if (!remoteJid || isStatusChat(remoteJid)) return null

  const messageId = firstString(
    rawMessage.id,
    getNestedValue(rawMessage, ['key', 'id']),
  ) ?? crypto.randomUUID()

  const descriptor = describeMessageContent(rawMessage)
  const fromMe = getNestedValue(rawMessage, ['key', 'fromMe']) === true

  return {
    id: messageId,
    remote_jid: remoteJid,
    text: normalizeText(
      descriptor.text,
      descriptor.type === 'unknown' ? 'Mensagem sem texto' : getMessageTypeLabel(descriptor.type),
    ),
    sent_at: toIsoDate(firstNumber(
      rawMessage.messageTimestamp,
      rawMessage.messageTimestampLow,
      rawMessage.timestamp,
    )),
    direction: fromMe ? 'outgoing' : 'incoming',
    status: fromMe ? normalizeMessageStatus(rawMessage.status) : undefined,
    type: descriptor.type,
    media: descriptor.media,
    contact: descriptor.contact,
    location: descriptor.location,
    sender_name: firstString(
      rawMessage.pushName,
      getNestedValue(rawMessage, ['participant', 'pushName']),
      getNestedValue(rawMessage, ['participant']),
    ),
  }
}

function sortContacts(contacts: NormalizedContact[]): NormalizedContact[] {
  return [...contacts].sort((a, b) => a.name.localeCompare(b.name))
}

function sortConversations(conversations: NormalizedConversation[]): NormalizedConversation[] {
  return [...conversations].sort((a, b) => {
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
    return bTime - aTime || a.name.localeCompare(b.name)
  })
}

function sortMessages(messages: NormalizedMessage[]): NormalizedMessage[] {
  return [...messages].sort((a, b) => {
    const aTime = a.sent_at ? new Date(a.sent_at).getTime() : 0
    const bTime = b.sent_at ? new Date(b.sent_at).getTime() : 0
    return aTime - bTime
  })
}

async function evolutionRequest(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<unknown> {
  return requestEvolutionApi(path, method, body)
}

async function resolveAccessibleInstance(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  instanceId: string | undefined,
): Promise<{ instance: AccessibleInstance | null; error: Response | null }> {
  if (!instanceId) {
    return { instance: null, error: errorResponse('instance_id required', 400) }
  }

  const { data, error } = await db
    .from('app_service_instances')
    .select('id, name, scope, owner_user_id, service_type, evolution_instance_name, connection_status, is_active, is_blocked')
    .eq('id', instanceId)
    .maybeSingle()

  if (error) {
    return { instance: null, error: errorResponse(`Failed to load instance: ${error.message}`, 500) }
  }

  if (!data) {
    return { instance: null, error: errorResponse('Instance not found', 404) }
  }

  if (data.service_type !== 'whatsapp') {
    return { instance: null, error: errorResponse('Invalid instance type', 400) }
  }

  if (data.scope === 'personal' && data.owner_user_id !== userId) {
    return { instance: null, error: errorResponse('Forbidden', 403) }
  }

  if (!data.is_active) {
    return { instance: null, error: errorResponse('A instancia selecionada esta inativa.', 409) }
  }

  if (data.is_blocked) {
    return { instance: null, error: errorResponse('A instancia selecionada esta bloqueada.', 409) }
  }

  if (!data.evolution_instance_name) {
    return { instance: null, error: errorResponse('A instancia nao possui identificacao na Evolution API.', 409) }
  }

  return {
    instance: data as AccessibleInstance,
    error: null,
  }
}

async function logInstanceEvent(
  db: ReturnType<typeof createServiceClient>,
  instance: AccessibleInstance,
  actorUserId: string,
  payload: {
    event_type: 'send_attempt' | 'send_success' | 'send_failed'
    status: 'pending' | 'success' | 'failure'
    context?: JsonRecord
    error_summary?: string
    correlation_id?: string
  },
): Promise<void> {
  await db.from('app_service_instance_events').insert({
    instance_id: instance.id,
    instance_scope: instance.scope,
    event_type: payload.event_type,
    origin: 'user',
    context: payload.context ?? {},
    status: payload.status,
    error_summary: payload.error_summary ?? null,
    actor_user_id: actorUserId,
    correlation_id: payload.correlation_id ?? null,
  })
}

async function fetchConversationMessages(
  instanceName: string,
  remoteJid: string,
  limit = 80,
): Promise<NormalizedMessage[]> {
  const normalizedRemoteJid = normalizeRemoteJid(remoteJid)
  const filteredResponse = await evolutionRequest(`/chat/findMessages/${instanceName}`, 'POST', {
    where: {
      key: {
        remoteJid: normalizedRemoteJid,
      },
    },
  })

  let messages = extractItemsFromResponse(filteredResponse)
    .map(normalizeMessage)
    .filter((message): message is NormalizedMessage => !!message && message.remote_jid === normalizedRemoteJid)

  if (messages.length === 0) {
    try {
      const fallbackResponse = await evolutionRequest(`/messages/fetch/${instanceName}`, 'GET')
      messages = extractItemsFromResponse(fallbackResponse)
        .map(normalizeMessage)
        .filter((message): message is NormalizedMessage => !!message && message.remote_jid === normalizedRemoteJid)
    } catch {
      // Keep the original result when the fallback endpoint is unavailable.
    }
  }

  const sortedMessages = sortMessages(messages)
  return limit > 0 ? sortedMessages.slice(-limit) : sortedMessages
}

async function fetchProfilePictureMap(
  instanceName: string,
  remoteJids: string[],
): Promise<Map<string, string | null>> {
  const uniqueRemoteJids = [...new Set(remoteJids.filter((remoteJid) => !!remoteJid && !isGroupChat(remoteJid)))]
  const result = new Map<string, string | null>()

  for (let index = 0; index < uniqueRemoteJids.length; index += 4) {
    const batch = uniqueRemoteJids.slice(index, index + 4)
    const batchResults = await Promise.allSettled(
      batch.map(async (remoteJid) => {
        const response = await evolutionRequest(`/chat/fetchProfilePictureUrl/${instanceName}`, 'POST', {
          number: remoteJid,
        })

        return {
          remoteJid,
          profilePictureUrl: firstString(
            response,
            getNestedValue(response, ['profilePictureUrl']),
            getNestedValue(response, ['pictureUrl']),
          ),
        }
      }),
    )

    batchResults.forEach((entry, batchIndex) => {
      const remoteJid = batch[batchIndex]
      if (entry.status === 'fulfilled') {
        result.set(remoteJid, entry.value.profilePictureUrl ?? null)
        return
      }

      result.set(remoteJid, null)
    })
  }

  return result
}

function ensureConnected(instance: AccessibleInstance): Response | null {
  if (instance.connection_status !== 'connected') {
    return errorResponse('A instancia selecionada ainda nao esta conectada.', 409)
  }

  return null
}

function resolveTarget(body: RequestBody): { remoteJid: string; phone: string; error: Response | null } {
  if (!body.remote_jid) {
    return { remoteJid: '', phone: '', error: errorResponse('remote_jid required', 400) }
  }

  const remoteJid = normalizeRemoteJid(body.remote_jid)
  if (!remoteJid) {
    return { remoteJid: '', phone: '', error: errorResponse('remote_jid invalido', 400) }
  }

  if (isGroupChat(remoteJid)) {
    return { remoteJid: '', phone: '', error: errorResponse('O envio para grupos ainda nao esta disponivel nesta tela.', 400) }
  }

  const targetPhone = remoteJidToPhone(remoteJid)
  if (!targetPhone) {
    return { remoteJid: '', phone: '', error: errorResponse('Nao foi possivel identificar o numero do destinatario.', 400) }
  }

  return { remoteJid, phone: targetPhone, error: null }
}

function createFallbackOutgoingMessage(
  remoteJid: string,
  type: MessageType,
  payload: {
    text?: string | null
    caption?: string | null
    mime_type?: string | null
    file_name?: string | null
  } = {},
): NormalizedMessage {
  const text = type === 'text'
    ? normalizeText(payload.text ?? null)
    : normalizeText(payload.caption ?? payload.text ?? null, getMessageTypeLabel(type))

  return {
    id: crypto.randomUUID(),
    remote_jid: remoteJid,
    text,
    sent_at: new Date().toISOString(),
    direction: 'outgoing',
    status: 'pending',
    type,
    media: type === 'text' || type === 'contact' || type === 'location' || type === 'unknown'
      ? null
      : {
          media_type: type,
          mime_type: payload.mime_type ?? null,
          file_name: payload.file_name ?? null,
          caption: payload.caption ?? null,
          url: null,
          direct_path: null,
          preview_data_url: null,
          file_size_bytes: null,
          duration_seconds: null,
          width: null,
          height: null,
          is_voice_note: type === 'audio',
          is_animated: type === 'sticker',
          requires_resolve: true,
        },
    contact: null,
    location: null,
    sender_name: null,
  }
}

async function handleGetContacts(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody,
): Promise<Response> {
  const { instance, error } = await resolveAccessibleInstance(db, userId, body.instance_id)
  if (!instance || error) return error ?? errorResponse('Instance not found', 404)

  const connectionError = ensureConnected(instance)
  if (connectionError) return connectionError

  const response = await evolutionRequest(`/chat/findContacts/${instance.evolution_instance_name}`, 'POST', {})
  const contacts = extractItemsFromResponse(response)
    .map(normalizeContact)
    .filter((contact): contact is NormalizedContact => !!contact)

  const pictures = await fetchProfilePictureMap(
    instance.evolution_instance_name ?? '',
    contacts.map((contact) => contact.remote_jid),
  )

  return jsonResponse({
    contacts: sortContacts(contacts.map((contact) => ({
      ...contact,
      profile_picture_url: pictures.get(contact.remote_jid) ?? contact.profile_picture_url,
    }))),
  })
}

async function handleGetChats(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody,
): Promise<Response> {
  const { instance, error } = await resolveAccessibleInstance(db, userId, body.instance_id)
  if (!instance || error) return error ?? errorResponse('Instance not found', 404)

  const connectionError = ensureConnected(instance)
  if (connectionError) return connectionError

  const response = await evolutionRequest(`/chat/findChats/${instance.evolution_instance_name}`, 'POST', {})
  const conversations = sortConversations(
    extractItemsFromResponse(response)
      .map(normalizeConversation)
      .filter((conversation): conversation is NormalizedConversation => !!conversation),
  )

  return jsonResponse({ conversations })
}

async function handleGetMessages(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody,
): Promise<Response> {
  const { instance, error } = await resolveAccessibleInstance(db, userId, body.instance_id)
  if (!instance || error) return error ?? errorResponse('Instance not found', 404)

  const connectionError = ensureConnected(instance)
  if (connectionError) return connectionError

  if (!body.remote_jid) {
    return errorResponse('remote_jid required', 400)
  }

  const limit = Math.min(body.limit ?? 80, 200)
  const messages = await fetchConversationMessages(
    instance.evolution_instance_name ?? '',
    body.remote_jid,
    limit,
  )

  return jsonResponse({
    remote_jid: normalizeRemoteJid(body.remote_jid),
    messages,
  })
}

async function persistSendSuccess(
  db: ReturnType<typeof createServiceClient>,
  instance: AccessibleInstance,
  userId: string,
  correlationId: string,
  context: JsonRecord,
): Promise<void> {
  await db
    .from('app_service_instances')
    .update({ last_activity_at: new Date().toISOString(), updated_by_user_id: userId })
    .eq('id', instance.id)

  await logInstanceEvent(db, instance, userId, {
    event_type: 'send_success',
    status: 'success',
    correlation_id: correlationId,
    context,
  })
}

async function persistSendFailure(
  db: ReturnType<typeof createServiceClient>,
  instance: AccessibleInstance,
  userId: string,
  correlationId: string,
  remoteJid: string,
  errorMessage: string,
): Promise<Response> {
  await logInstanceEvent(db, instance, userId, {
    event_type: 'send_failed',
    status: 'failure',
    correlation_id: correlationId,
    context: {
      remote_jid: remoteJid,
    },
    error_summary: errorMessage,
  })

  return errorResponse(errorMessage, 500)
}

async function handleSendMessage(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody,
): Promise<Response> {
  const { instance, error } = await resolveAccessibleInstance(db, userId, body.instance_id)
  if (!instance || error) return error ?? errorResponse('Instance not found', 404)

  const connectionError = ensureConnected(instance)
  if (connectionError) return connectionError

  const target = resolveTarget(body)
  if (target.error) return target.error

  const correlationId = crypto.randomUUID()
  await logInstanceEvent(db, instance, userId, {
    event_type: 'send_attempt',
    status: 'pending',
    correlation_id: correlationId,
    context: {
      remote_jid: target.remoteJid,
      text_length: body.message?.trim().length ?? 0,
      type: 'text',
    },
  })

  try {
    const response = await evolutionRequest(`/message/sendText/${instance.evolution_instance_name}`, 'POST', {
      number: target.phone,
      text: body.message?.trim() ?? '',
    })

    const normalizedMessage = normalizeMessage(response)
      ?? createFallbackOutgoingMessage(target.remoteJid, 'text', {
        text: body.message?.trim() ?? '',
      })

    await persistSendSuccess(db, instance, userId, correlationId, {
      remote_jid: target.remoteJid,
      message_id: normalizedMessage.id,
      type: 'text',
    })

    return jsonResponse({
      message: normalizedMessage,
      result: response,
    })
  } catch (sendError) {
    const errorMessage = sendError instanceof Error ? sendError.message : 'Erro desconhecido ao enviar mensagem'
    return persistSendFailure(db, instance, userId, correlationId, target.remoteJid, errorMessage)
  }
}

async function handleSendMedia(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody,
): Promise<Response> {
  const { instance, error } = await resolveAccessibleInstance(db, userId, body.instance_id)
  if (!instance || error) return error ?? errorResponse('Instance not found', 404)

  const connectionError = ensureConnected(instance)
  if (connectionError) return connectionError

  const target = resolveTarget(body)
  if (target.error) return target.error

  const base64Payload = sanitizeBase64Payload(body.media)
  if (!base64Payload) {
    return errorResponse('media required', 400)
  }

  const mediaType = inferOutgoingMediaType(body.media_type, body.mime_type)
  const correlationId = crypto.randomUUID()

  await logInstanceEvent(db, instance, userId, {
    event_type: 'send_attempt',
    status: 'pending',
    correlation_id: correlationId,
    context: {
      remote_jid: target.remoteJid,
      type: mediaType,
      mime_type: body.mime_type ?? null,
      file_name: body.file_name ?? null,
    },
  })

  try {
    let response: unknown

    if (mediaType === 'audio') {
      response = await evolutionRequest(`/message/sendWhatsAppAudio/${instance.evolution_instance_name}`, 'POST', {
        number: target.phone,
        audio: base64Payload,
      })
    } else {
      response = await evolutionRequest(`/message/sendMedia/${instance.evolution_instance_name}`, 'POST', {
        number: target.phone,
        mediatype: mediaType,
        mimetype: body.mime_type ?? undefined,
        fileName: sanitizeFileName(body.file_name, mediaType === 'document' ? 'arquivo' : `midia-${Date.now()}`),
        caption: body.caption?.trim() ?? undefined,
        media: base64Payload,
      })
    }

    const normalizedMessage = normalizeMessage(response)
      ?? createFallbackOutgoingMessage(target.remoteJid, mediaType, {
        text: body.caption ?? null,
        caption: body.caption ?? null,
        mime_type: body.mime_type ?? null,
        file_name: body.file_name ?? null,
      })

    await persistSendSuccess(db, instance, userId, correlationId, {
      remote_jid: target.remoteJid,
      message_id: normalizedMessage.id,
      type: mediaType,
    })

    return jsonResponse({
      message: normalizedMessage,
      result: response,
    })
  } catch (sendError) {
    const errorMessage = sendError instanceof Error ? sendError.message : 'Erro desconhecido ao enviar arquivo'
    return persistSendFailure(db, instance, userId, correlationId, target.remoteJid, errorMessage)
  }
}

async function handleSendSticker(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody,
): Promise<Response> {
  const { instance, error } = await resolveAccessibleInstance(db, userId, body.instance_id)
  if (!instance || error) return error ?? errorResponse('Instance not found', 404)

  const connectionError = ensureConnected(instance)
  if (connectionError) return connectionError

  const target = resolveTarget(body)
  if (target.error) return target.error

  const base64Payload = sanitizeBase64Payload(body.media)
  if (!base64Payload) {
    return errorResponse('media required', 400)
  }

  const correlationId = crypto.randomUUID()
  await logInstanceEvent(db, instance, userId, {
    event_type: 'send_attempt',
    status: 'pending',
    correlation_id: correlationId,
    context: {
      remote_jid: target.remoteJid,
      type: 'sticker',
      mime_type: body.mime_type ?? null,
      file_name: body.file_name ?? null,
    },
  })

  try {
    const response = await evolutionRequest(`/message/sendSticker/${instance.evolution_instance_name}`, 'POST', {
      number: target.phone,
      sticker: base64Payload,
    })

    const normalizedMessage = normalizeMessage(response)
      ?? createFallbackOutgoingMessage(target.remoteJid, 'sticker', {
        mime_type: body.mime_type ?? 'image/webp',
        file_name: body.file_name ?? 'sticker.webp',
      })

    await persistSendSuccess(db, instance, userId, correlationId, {
      remote_jid: target.remoteJid,
      message_id: normalizedMessage.id,
      type: 'sticker',
    })

    return jsonResponse({
      message: normalizedMessage,
      result: response,
    })
  } catch (sendError) {
    const errorMessage = sendError instanceof Error ? sendError.message : 'Erro desconhecido ao enviar figurinha'
    return persistSendFailure(db, instance, userId, correlationId, target.remoteJid, errorMessage)
  }
}

function inferResolvedMediaType(mimeType: string | null, fallbackType: string | null): NormalizedMedia['media_type'] {
  if (fallbackType === 'sticker') return 'sticker'
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.startsWith('video/')) return 'video'
  if (mimeType?.startsWith('audio/')) return 'audio'

  return 'document'
}

async function handleResolveMedia(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody,
): Promise<Response> {
  const { instance, error } = await resolveAccessibleInstance(db, userId, body.instance_id)
  if (!instance || error) return error ?? errorResponse('Instance not found', 404)

  const connectionError = ensureConnected(instance)
  if (connectionError) return connectionError

  if (!body.message_id) {
    return jsonResponse({ media: null })
  }

  let response: unknown
  try {
    response = await evolutionRequest(`/chat/getBase64FromMediaMessage/${instance.evolution_instance_name}`, 'POST', {
      message: {
        key: {
          id: body.message_id,
          remoteJid: body.remote_jid ? normalizeRemoteJid(body.remote_jid) : undefined,
        },
      },
      convertToMp4: body.convert_to_mp4 ?? false,
    })
  } catch (resolveError) {
    console.warn('Failed to resolve WhatsApp media payload.', {
      instanceId: instance.id,
      messageId: body.message_id,
      remoteJid: body.remote_jid ?? null,
      error: resolveError instanceof Error ? resolveError.message : String(resolveError),
    })

    return jsonResponse({ media: null })
  }

  const base64Payload = sanitizeBase64Payload(firstString(
    response,
    getNestedValue(response, ['base64']),
    getNestedValue(response, ['data']),
    getNestedValue(response, ['message']),
  ) ?? undefined)

  const mimeType = firstString(
    body.mime_type,
    getNestedValue(response, ['mimetype']),
    getNestedValue(response, ['mimeType']),
  )

  const fileName = firstString(
    body.file_name,
    getNestedValue(response, ['fileName']),
    getNestedValue(response, ['filename']),
  )

  const resolvedType = inferResolvedMediaType(
    mimeType,
    firstString(
      getNestedValue(response, ['mediaType']),
      getNestedValue(response, ['mediatype']),
    ),
  )

  return jsonResponse({
    media: {
      message_id: body.message_id,
      base64: base64Payload,
      data_url: buildDataUrl(base64Payload, mimeType),
      mime_type: mimeType,
      file_name: fileName,
      media_type: resolvedType,
    },
  })
}

const handler = async ({
  body,
  user,
}: AuthenticatedHandlerContext<RequestBody>): Promise<Response> => {
  const db = createServiceClient()
  const canUseWhatsApp = await userHasPermission(db, user.id, 'whatsapp.view')

  if (!canUseWhatsApp) {
    return errorResponse('Permission denied for WhatsApp.', 403)
  }

  switch (body.action) {
    case 'get_contacts':
      return handleGetContacts(db, user.id, body)
    case 'get_chats':
      return handleGetChats(db, user.id, body)
    case 'get_messages':
      return handleGetMessages(db, user.id, body)
    case 'send_message':
      return handleSendMessage(db, user.id, body)
    case 'send_media':
      return handleSendMedia(db, user.id, body)
    case 'send_sticker':
      return handleSendSticker(db, user.id, body)
    case 'resolve_media':
      return handleResolveMedia(db, user.id, body)
    default:
      return errorResponse(`Unknown action: ${body.action}`, 400)
  }
}

Deno.serve(createHandler(handler, { requireAuth: true, parseBody }))
