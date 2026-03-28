import { createHandler } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { userHasPermission } from '../_shared/auth/mod.ts'
import { errorResponse } from '../_shared/http/mod.ts'
import { sendMessage, getConversations, getMessages } from './service.ts'
import { parseMessagingPayload } from './payload.ts'

Deno.serve(createHandler(async ({ body, user }) => {
  const supabase = createServiceClient()
  const canUseMessaging = await userHasPermission(supabase, user.id, 'messages.view')

  if (!canUseMessaging) {
    return errorResponse('Permission denied for Moodle messaging.', 403)
  }

  switch (body.action) {
    case 'send_message':
      return await sendMessage(body)
    case 'get_conversations':
      return await getConversations(body)
    case 'get_messages':
      return await getMessages(body)
    default:
      return errorResponse('Invalid messaging action')
  }
}, { requireAuth: true, parseBody: parseMessagingPayload }))
