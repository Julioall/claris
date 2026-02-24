import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { validateString, validatePositiveInteger } from '../_shared/validation.ts'
import { callMoodleApi, getSiteInfo } from '../_shared/moodle-client.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const body = await req.json()
    const { action } = body

    switch (action) {
      case 'send_message':
        return await handleSendMessage(body)
      case 'get_conversations':
        return await handleGetConversations(body)
      case 'get_messages':
        return await handleGetMessages(body)
      default:
        return errorResponse('Invalid messaging action')
    }
  } catch (error: unknown) {
    console.error('Error in moodle-messaging:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', 500)
  }
})

async function handleSendMessage(body: any): Promise<Response> {
  const { moodleUrl, token, moodle_user_id: targetMoodleUserId, message: messageText } = body
  if (!targetMoodleUserId || !messageText) {
    return errorResponse('moodle_user_id and message are required')
  }

  console.log(`Sending message to Moodle user ${targetMoodleUserId}`)

  try {
    const result = await callMoodleApi(moodleUrl, token, 'core_message_send_instant_messages', {
      'messages[0][touserid]': Number(targetMoodleUserId),
      'messages[0][text]': String(messageText),
      'messages[0][textformat]': 0,
    })

    const msgResult = Array.isArray(result) ? result[0] : result
    if (msgResult?.errormessage) return errorResponse(msgResult.errormessage)

    return jsonResponse({ success: true, message_id: msgResult?.msgid })
  } catch (err) {
    console.error('Error sending message:', err)
    return errorResponse(
      err instanceof Error ? err.message : 'Failed to send message.',
      500
    )
  }
}

async function handleGetConversations(body: any): Promise<Response> {
  const { moodleUrl, token } = body
  console.log('Fetching conversations from Moodle')

  try {
    const siteInfo = await getSiteInfo(moodleUrl, token)
    const result = await callMoodleApi(moodleUrl, token, 'core_message_get_conversations', {
      userid: siteInfo.userid,
      type: 1,
      limitnum: 50,
    })

    const conversations = (result?.conversations || []).map((conv: any) => ({
      id: conv.id,
      members: (conv.members || []).map((m: any) => ({
        id: m.id,
        fullname: m.fullname,
        profileimageurl: m.profileimageurl,
      })),
      messages: (conv.messages || []).map((msg: any) => ({
        id: msg.id,
        text: msg.text,
        timecreated: msg.timecreated,
        useridfrom: msg.useridfrom,
      })),
      unreadcount: conv.unreadcount || 0,
    }))

    return jsonResponse({ conversations, current_user_id: siteInfo.userid })
  } catch (err) {
    console.error('Error fetching conversations:', err)
    return errorResponse(
      err instanceof Error ? err.message : 'Failed to fetch conversations.',
      500
    )
  }
}

async function handleGetMessages(body: any): Promise<Response> {
  const { moodleUrl, token, moodle_user_id: otherUserId, limit_num: limitNum } = body
  if (!otherUserId) return errorResponse('moodle_user_id is required')

  console.log(`Fetching messages with Moodle user ${otherUserId}`)

  try {
    const siteInfo = await getSiteInfo(moodleUrl, token)
    const apiUrl = `${moodleUrl}/webservice/rest/server.php`
    const formData = new URLSearchParams({
      wstoken: token,
      wsfunction: 'core_message_get_conversation_between_users',
      moodlewsrestformat: 'json',
      userid: String(siteInfo.userid),
      otheruserid: String(Number(otherUserId)),
      includecontactrequests: '0',
      includeprivacyinfo: '0',
      messagelimit: String(Number(limitNum) || 50),
      messageoffset: '0',
      newestmessagesfirst: '1',
    })

    const convResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    })
    const convResult = await convResponse.json()

    if (convResult.exception) throw new Error(convResult.message || 'Moodle API error')

    const messages = (convResult?.messages || []).map((msg: any) => ({
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
  } catch (err) {
    console.error('Error fetching messages:', err)
    return errorResponse(err instanceof Error ? err.message : 'Failed to fetch messages.', 500)
  }
}
