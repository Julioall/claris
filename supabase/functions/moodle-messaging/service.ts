import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { callMoodleApi, callMoodleApiPost, getSiteInfo } from '../_shared/moodle/mod.ts'
import type {
  GetConversationsPayload,
  GetMessagesPayload,
  SendMessagePayload,
} from './payload.ts'

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

export async function sendMessage(body: SendMessagePayload): Promise<Response> {
  const { moodleUrl, token, moodleUserId: targetMoodleUserId, message: messageText } = body

  console.log(`Sending message to Moodle user ${targetMoodleUserId}`)

  const result = await callMoodleApi(String(moodleUrl), String(token), 'core_message_send_instant_messages', {
    'messages[0][touserid]': Number(targetMoodleUserId),
    'messages[0][text]': String(messageText),
    'messages[0][textformat]': 0,
  })

  const msgResult = Array.isArray(result) ? result[0] : result
  if (msgResult?.errormessage) return errorResponse(msgResult.errormessage)

  return jsonResponse({ success: true, message_id: msgResult?.msgid })
}

export async function getConversations(body: GetConversationsPayload): Promise<Response> {
  const { moodleUrl, token } = body
  console.log('Fetching conversations from Moodle')

  const siteInfo = await getSiteInfo(String(moodleUrl), String(token))
  const result = await callMoodleApi(String(moodleUrl), String(token), 'core_message_get_conversations', {
    userid: siteInfo.userid,
    type: 1,
    limitnum: 50,
  })

  const conversations = (result?.conversations || []).map((conv: Record<string, unknown>) => ({
    id: conv.id,
    members: (conv.members || []).map((m: Record<string, unknown>) => ({
      id: m.id,
      fullname: m.fullname,
      profileimageurl: m.profileimageurl,
    })),
    messages: (conv.messages || []).map((msg: Record<string, unknown>) => ({
      id: msg.id,
      text: msg.text,
      timecreated: msg.timecreated,
      useridfrom: msg.useridfrom,
    })),
    unreadcount: conv.unreadcount || 0,
  }))

  return jsonResponse({ conversations, current_user_id: siteInfo.userid })
}

export async function getMessages(body: GetMessagesPayload): Promise<Response> {
  const { moodleUrl, token, moodleUserId: otherUserId, limitNum } = body
  console.log(`Fetching messages with Moodle user ${otherUserId}`)

  const siteInfo = await getSiteInfo(String(moodleUrl), String(token))
  let convResult: Record<string, unknown> | undefined

  try {
    convResult = await callMoodleApiPost(
      String(moodleUrl),
      String(token),
      'core_message_get_conversation_between_users',
      {
        userid: siteInfo.userid,
        otheruserid: Number(otherUserId),
        includecontactrequests: 0,
        includeprivacyinfo: 0,
        messagelimit: limitNum || 50,
        messageoffset: 0,
        newestmessagesfirst: 1,
      },
    )
  } catch (error) {
    if (isConversationMissingError(error)) {
      console.log(`No existing conversation with Moodle user ${otherUserId}`)
      return jsonResponse({
        messages: [],
        current_user_id: siteInfo.userid,
        conversation_id: null,
      })
    }

    throw error
  }

  const messages = (convResult?.messages || []).map((msg: Record<string, unknown>) => ({
    id: msg.id,
    text: msg.text,
    timecreated: msg.timecreated,
    useridfrom: msg.useridfrom,
  }))

  return jsonResponse({
    messages,
    current_user_id: siteInfo.userid,
    conversation_id: convResult?.id,
  })
}
