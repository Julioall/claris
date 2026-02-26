import { createHandler } from '../_shared/http/mod.ts'
import { errorResponse } from '../_shared/http/mod.ts'
import { sendMessage, getConversations, getMessages } from './service.ts'

Deno.serve(createHandler(async ({ body }) => {
  const { action } = body as { action?: string }

  switch (action) {
    case 'send_message':
      return await sendMessage(body as Record<string, unknown>)
    case 'get_conversations':
      return await getConversations(body as Record<string, unknown>)
    case 'get_messages':
      return await getMessages(body as Record<string, unknown>)
    default:
      return errorResponse('Invalid messaging action')
  }
}))
