// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseClarisConversationsPayload } from './payload.ts'
import { createClarisConversationsRepository } from './repository.ts'
import {
  authorizeClarisConversations,
  executeClarisConversations,
} from './service.ts'

const repository = createClarisConversationsRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  return apiSuccessResponse(
    await executeClarisConversations(repository, user.id, body),
    correlationId,
  )
}, {
  authorize: ({ user }) => authorizeClarisConversations(repository, user.id),
  maxBodyBytes: 512 * 1024,
  parseBody: parseClarisConversationsPayload,
  requireAuth: true,
}))
