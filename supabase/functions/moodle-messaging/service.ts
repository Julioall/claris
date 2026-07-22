import type { MoodleAccess } from '../_shared/domain/moodle-connections/access.ts'
import { ApiError } from '../_shared/http/mod.ts'
import { callMoodleApi, callMoodleApiPost, getSiteInfo } from '../_shared/moodle/mod.ts'
import {
  MOODLE_MESSAGING_CONTRACT_VERSION,
  type MoodleConversationDto,
  type MoodleConversationsDto,
  type MoodleMessageSentDto,
  type MoodleMessagesDto,
  type MoodleMessagingResponseDto,
} from './contract.ts'
import type { MessagingPayload } from './payload.ts'
import type { MoodleMessagingRepository } from './repository.ts'

interface MoodleMessageRecord {
  id: unknown
  text: string
  timecreated: number
  useridfrom: number
}

interface MoodleMemberRecord {
  fullname: string
  id: number
  profileimageurl: string | null
}

interface MoodleConversationRecord {
  id: number
  members: MoodleMemberRecord[]
  messages: MoodleMessageRecord[]
  unreadcount: number
}

interface ConversationsResult {
  conversations: MoodleConversationRecord[]
  currentUserId: number
}

interface MessagesResult {
  conversationId: number | null
  currentUserId: number
  messages: MoodleMessageRecord[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function numberOr(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function textOr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeMessage(value: Record<string, unknown>): MoodleMessageRecord {
  return {
    id: value.id,
    text: textOr(value.text),
    timecreated: numberOr(value.timecreated),
    useridfrom: numberOr(value.useridfrom),
  }
}

function normalizeMember(value: Record<string, unknown>): MoodleMemberRecord {
  return {
    id: numberOr(value.id),
    fullname: textOr(value.fullname, 'Desconhecido'),
    profileimageurl: typeof value.profileimageurl === 'string' && value.profileimageurl
      ? value.profileimageurl
      : null,
  }
}

function normalizeConversation(value: Record<string, unknown>): MoodleConversationRecord {
  return {
    id: numberOr(value.id),
    members: records(value.members).map(normalizeMember),
    messages: records(value.messages).map(normalizeMessage),
    unreadcount: Math.max(0, numberOr(value.unreadcount)),
  }
}

function isConversationMissingError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const normalized = error.message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  return normalized.includes('conversa nao existe') ||
    normalized.includes('conversation does not exist') ||
    normalized.includes('conversation not found')
}

async function sendMessageToMoodle(
  access: MoodleAccess,
  targetMoodleUserId: number,
  messageText: string,
): Promise<{ errorMessage: string | null; messageId: unknown }> {
  const result = await callMoodleApi(access.moodleUrl, access.token, 'core_message_send_instant_messages', {
    'messages[0][touserid]': targetMoodleUserId,
    'messages[0][text]': messageText,
    'messages[0][textformat]': 0,
  })

  const messageResult = Array.isArray(result) ? result[0] : result
  return {
    errorMessage: isRecord(messageResult) && typeof messageResult.errormessage === 'string'
      ? messageResult.errormessage
      : null,
    messageId: isRecord(messageResult) ? messageResult.msgid : null,
  }
}

async function fetchConversationsFromMoodle(access: MoodleAccess): Promise<ConversationsResult> {
  const siteInfo = await getSiteInfo(access.moodleUrl, access.token)
  const currentUserId = numberOr(siteInfo.userid)
  const result = await callMoodleApi(access.moodleUrl, access.token, 'core_message_get_conversations', {
    userid: currentUserId,
    type: 1,
    limitnum: 50,
  })

  return {
    currentUserId,
    conversations: records(isRecord(result) ? result.conversations : []).map(normalizeConversation),
  }
}

async function fetchMessagesFromMoodle(
  access: MoodleAccess,
  otherUserId: number,
  limit: number,
): Promise<MessagesResult> {
  const siteInfo = await getSiteInfo(access.moodleUrl, access.token)
  const currentUserId = numberOr(siteInfo.userid)
  let conversation: Record<string, unknown> | null = null

  try {
    const result = await callMoodleApiPost(
      access.moodleUrl,
      access.token,
      'core_message_get_conversation_between_users',
      {
        userid: currentUserId,
        otheruserid: otherUserId,
        includecontactrequests: 0,
        includeprivacyinfo: 0,
        messagelimit: limit,
        messageoffset: 0,
        newestmessagesfirst: 1,
      },
    )
    conversation = isRecord(result) ? result : null
  } catch (error) {
    if (!isConversationMissingError(error)) throw error
  }

  return {
    currentUserId,
    conversationId: conversation ? numberOr(conversation.id) || null : null,
    messages: records(conversation?.messages).map(normalizeMessage),
  }
}

function toConversationDto(
  conversation: MoodleConversationRecord,
  currentUserId: number,
  moodleToStudentId: Map<string, string>,
): MoodleConversationDto {
  const member = conversation.members.find((candidate) => candidate.id !== currentUserId)
    ?? conversation.members[0]
    ?? { id: 0, fullname: 'Desconhecido', profileimageurl: null }
  const lastMessage = conversation.messages[0]

  return {
    id: conversation.id,
    member: {
      id: member.id,
      fullName: member.fullname,
      profileImageUrl: member.profileimageurl,
    },
    lastMessage: lastMessage
      ? { text: lastMessage.text, createdAtUnix: lastMessage.timecreated }
      : null,
    unreadCount: conversation.unreadcount,
    studentId: moodleToStudentId.get(String(member.id)) ?? null,
  }
}

export async function executeMessaging(
  repository: MoodleMessagingRepository,
  actorId: string,
  access: MoodleAccess,
  body: MessagingPayload,
): Promise<MoodleMessagingResponseDto> {
  if (body.action === 'send_message') {
    await repository.assertAccessibleMoodleUser(actorId, access.moodleSiteId, body.moodleUserId)
    const result = await sendMessageToMoodle(access, body.moodleUserId, body.message)
    if (result.errorMessage) throw ApiError.unprocessable(result.errorMessage)

    return {
      contractVersion: MOODLE_MESSAGING_CONTRACT_VERSION,
      messageId: result.messageId === null || result.messageId === undefined
        ? null
        : String(result.messageId),
    } satisfies MoodleMessageSentDto
  }

  if (body.action === 'get_messages') {
    await repository.assertAccessibleMoodleUser(actorId, access.moodleSiteId, body.moodleUserId)
    const result = await fetchMessagesFromMoodle(access, body.moodleUserId, body.limit)
    const items = result.messages
      .map((message) => ({
        id: String(message.id ?? ''),
        text: message.text,
        createdAtUnix: message.timecreated,
        senderMoodleUserId: message.useridfrom,
        senderType: message.useridfrom === result.currentUserId ? 'tutor' as const : 'student' as const,
      }))
      .sort((left, right) => left.createdAtUnix - right.createdAtUnix)

    return {
      contractVersion: MOODLE_MESSAGING_CONTRACT_VERSION,
      conversationId: result.conversationId,
      currentMoodleUserId: result.currentUserId,
      items,
    } satisfies MoodleMessagesDto
  }

  const result = await fetchConversationsFromMoodle(access)
  const moodleToStudentId = await repository.listAccessibleStudentIds(
    actorId,
    access.moodleSiteId,
    result.conversations.flatMap((conversation) => conversation.members.map((member) => member.id)),
  )
  const items = result.conversations
    .map((conversation) => toConversationDto(conversation, result.currentUserId, moodleToStudentId))
    .sort((left, right) => (
      (right.lastMessage?.createdAtUnix ?? 0) - (left.lastMessage?.createdAtUnix ?? 0)
    ))

  return {
    contractVersion: MOODLE_MESSAGING_CONTRACT_VERSION,
    currentMoodleUserId: result.currentUserId,
    items,
  } satisfies MoodleConversationsDto
}
