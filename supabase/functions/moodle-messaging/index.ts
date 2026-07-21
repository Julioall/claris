// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { createServiceClient } from '../_shared/db/mod.ts'
import { resolveMoodleAccess } from '../_shared/domain/moodle-reauth/access.ts'
import { ApiError, apiSuccessResponse, createHandler, errorResponse } from '../_shared/http/mod.ts'
import { parseMessagingPayload } from './payload.ts'
import { createMoodleMessagingRepository } from './repository.ts'
import { executeMessagingV1, getConversations, getMessages, sendMessage } from './service.ts'

const supabase = createServiceClient()
const repository = createMoodleMessagingRepository(supabase)

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  if (body.requestVersion === 'v1') {
    let access
    try {
      access = await resolveMoodleAccess(supabase, user.id)
    } catch (error) {
      throw ApiError.conflict(
        error instanceof Error ? error.message : 'Nao foi possivel acessar o Moodle pelo servidor.',
      )
    }

    return apiSuccessResponse(
      await executeMessagingV1(repository, user.id, access, body),
      correlationId,
    )
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
}, {
  authorize: ({ user }) => repository.userCanViewMessages(user.id),
  maxBodyBytes: 16 * 1024,
  parseBody: parseMessagingPayload,
  requireAuth: true,
}))
