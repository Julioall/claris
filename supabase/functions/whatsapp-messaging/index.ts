// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import {
  createHandler,
  errorResponse,
  expectBodyObject,
  jsonResponse,
  readOptionalPositiveInteger,
  readOptionalString,
  readRequiredLiteral,
  readRequiredString,
} from '../_shared/http/mod.ts'
import type { AuthenticatedHandlerContext } from '../_shared/http/mod.ts'
import { userHasPermission } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import {
  normalizePhone,
  remoteJidToPhone,
  resolveConversationName,
} from '../_shared/whatsapp/normalization.ts'

const ACTIONS = ['get_chats', 'get_messages', 'send_message'] as const

type Action = (typeof ACTIONS)[number]
type EvolutionMethod = 'GET' | 'POST'
type JsonRecord = Record<string, unknown>

interface RequestBody {
  action: Action
  instance_id?: string
  remote_jid?: string
  message?: string
  limit?: number
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

interface NormalizedConversation {
  id: string
  remote_jid: string
  name: string
  phone: string | null
  unread_count: number
  last_message_text: string
  last_message_at: string | null
  is_group: boolean
}

interface NormalizedMessage {
  id: string
  remote_jid: string
  text: string
  sent_at: string | null
  direction: 'incoming' | 'outgoing'
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'error'
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

function extractTextFromMessage(message: unknown): string | null {
  if (!isRecord(message)) return null

  const candidates = [
    getNestedValue(message, ['conversation']),
    getNestedValue(message, ['extendedTextMessage', 'text']),
    getNestedValue(message, ['imageMessage', 'caption']),
    getNestedValue(message, ['videoMessage', 'caption']),
    getNestedValue(message, ['documentMessage', 'caption']),
    getNestedValue(message, ['buttonsResponseMessage', 'selectedDisplayText']),
    getNestedValue(message, ['listResponseMessage', 'title']),
    getNestedValue(message, ['templateButtonReplyMessage', 'selectedDisplayText']),
    getNestedValue(message, ['reactionMessage', 'text']),
  ]

  const directText = firstString(...candidates)
  if (directText) return directText

  const editedMessage = getNestedValue(message, ['editedMessage', 'message'])
  if (editedMessage) {
    const editedText = extractTextFromMessage(editedMessage)
    if (editedText) return editedText
  }

  const protocolEditedMessage = getNestedValue(message, ['protocolMessage', 'editedMessage'])
  if (protocolEditedMessage) {
    const protocolText = extractTextFromMessage(protocolEditedMessage)
    if (protocolText) return protocolText
  }

  return null
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
  keys: string[] = ['messages', 'chats', 'data', 'result'],
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
  const conversationName = resolveConversationName(rawConversation, remoteJid)

  const lastMessageText = normalizeText(firstString(
    rawConversation.lastMessage,
    extractTextFromMessage(getNestedValue(rawConversation, ['lastMessage', 'message'])),
    extractTextFromMessage(rawConversation.message),
  ))

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
    name: conversationName,
    phone: phone ? `+${phone}` : null,
    unread_count: unreadCount,
    last_message_text: lastMessageText,
    last_message_at: lastMessageAt,
    is_group: isGroupChat(remoteJid),
  }
}

function normalizeMessage(rawMessage: unknown): NormalizedMessage | null {
  if (!isRecord(rawMessage)) return null

  const remoteJid = firstString(
    rawMessage.remoteJid,
    getNestedValue(rawMessage, ['key', 'remoteJid']),
  )
  if (!remoteJid || isStatusChat(remoteJid)) return null

  const messageId = firstString(
    rawMessage.id,
    getNestedValue(rawMessage, ['key', 'id']),
  ) ?? crypto.randomUUID()

  const text = normalizeText(extractTextFromMessage(rawMessage.message))
  const sentAt = toIsoDate(firstNumber(
    rawMessage.messageTimestamp,
    rawMessage.messageTimestampLow,
    rawMessage.timestamp,
  ))
  const fromMe = getNestedValue(rawMessage, ['key', 'fromMe']) === true

  return {
    id: messageId,
    remote_jid: remoteJid,
    text,
    sent_at: sentAt,
    direction: fromMe ? 'outgoing' : 'incoming',
    status: fromMe ? normalizeMessageStatus(rawMessage.status) : undefined,
  }
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

function getEvolutionBaseUrl(): string {
  return (Deno.env.get('EVOLUTION_API_URL') ?? '').trim().replace(/\/+$/, '')
}

function getEvolutionApiKey(): string {
  return Deno.env.get('EVOLUTION_API_KEY') ?? ''
}

async function evolutionRequest(
  path: string,
  method: EvolutionMethod,
  body?: unknown,
): Promise<unknown> {
  const baseUrl = getEvolutionBaseUrl()
  const apiKey = getEvolutionApiKey()

  if (!baseUrl || !apiKey) {
    throw new Error('Evolution API não configurada. Defina EVOLUTION_API_URL e EVOLUTION_API_KEY.')
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    throw new Error(`Evolution API error ${response.status}: ${text}`)
  }

  return response.json().catch(() => null)
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
    return { instance: null, error: errorResponse('A instância selecionada está inativa.', 409) }
  }

  if (data.is_blocked) {
    return { instance: null, error: errorResponse('A instância selecionada está bloqueada.', 409) }
  }

  if (!data.evolution_instance_name) {
    return { instance: null, error: errorResponse('A instância não possui identificação na Evolution API.', 409) }
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
      // Fallback inferred from the official EvolutionAPI issue tracker for cases
      // where the remoteJid filter returns an empty set unexpectedly.
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

async function handleGetChats(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody,
): Promise<Response> {
  const { instance, error } = await resolveAccessibleInstance(db, userId, body.instance_id)
  if (!instance || error) return error ?? errorResponse('Instance not found', 404)

  if (instance.connection_status !== 'connected') {
    return errorResponse('A instância selecionada ainda não está conectada.', 409)
  }

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

  if (instance.connection_status !== 'connected') {
    return errorResponse('A instância selecionada ainda não está conectada.', 409)
  }

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

async function handleSendMessage(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody,
): Promise<Response> {
  const { instance, error } = await resolveAccessibleInstance(db, userId, body.instance_id)
  if (!instance || error) return error ?? errorResponse('Instance not found', 404)

  if (instance.connection_status !== 'connected') {
    return errorResponse('A instância selecionada ainda não está conectada.', 409)
  }

  if (!body.remote_jid) {
    return errorResponse('remote_jid required', 400)
  }

  const remoteJid = normalizeRemoteJid(body.remote_jid)
  if (!remoteJid) {
    return errorResponse('remote_jid inválido', 400)
  }

  if (isGroupChat(remoteJid)) {
    return errorResponse('O envio para grupos ainda não está disponível nesta tela.', 400)
  }

  const targetPhone = remoteJidToPhone(remoteJid)
  if (!targetPhone) {
    return errorResponse('Não foi possível identificar o número do destinatário.', 400)
  }

  const correlationId = crypto.randomUUID()
  await logInstanceEvent(db, instance, userId, {
    event_type: 'send_attempt',
    status: 'pending',
    correlation_id: correlationId,
    context: {
      remote_jid: remoteJid,
      text_length: body.message?.trim().length ?? 0,
    },
  })

  try {
    const response = await evolutionRequest(`/message/sendText/${instance.evolution_instance_name}`, 'POST', {
      number: targetPhone,
      text: body.message?.trim() ?? '',
    })

    const normalizedMessage = normalizeMessage(response)
      ?? {
        id: crypto.randomUUID(),
        remote_jid: remoteJid,
        text: normalizeText(body.message?.trim() ?? null),
        sent_at: new Date().toISOString(),
        direction: 'outgoing' as const,
        status: 'pending' as const,
      }

    await db
      .from('app_service_instances')
      .update({ last_activity_at: new Date().toISOString(), updated_by_user_id: userId })
      .eq('id', instance.id)

    await logInstanceEvent(db, instance, userId, {
      event_type: 'send_success',
      status: 'success',
      correlation_id: correlationId,
      context: {
        remote_jid: remoteJid,
        message_id: normalizedMessage.id,
      },
    })

    return jsonResponse({
      message: normalizedMessage,
      result: response,
    })
  } catch (sendError) {
    const errorMessage = sendError instanceof Error ? sendError.message : 'Erro desconhecido ao enviar mensagem'
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
    case 'get_chats':
      return handleGetChats(db, user.id, body)
    case 'get_messages':
      return handleGetMessages(db, user.id, body)
    case 'send_message':
      return handleSendMessage(db, user.id, body)
    default:
      return errorResponse(`Unknown action: ${body.action}`, 400)
  }
}

Deno.serve(createHandler(handler, { requireAuth: true, parseBody }))
