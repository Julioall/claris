// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseSupportTicketsPayload } from './payload.ts'
import { createSupportTicketsRepository } from './repository.ts'
import { executeSupportTickets } from './service.ts'

const repository = createSupportTicketsRepository()

Deno.serve(createHandler(async ({ body, correlationId, req, user }) => {
  const result = await executeSupportTickets(repository, user.id, body, {
    correlationId,
    userAgent: req.headers.get('user-agent'),
  })
  return apiSuccessResponse(result, correlationId)
}, {
  authorize: ({ body, user }) => body.action === 'create_ticket'
    || repository.isApplicationAdmin(user.id),
  maxBodyBytes: 16 * 1024,
  parseBody: parseSupportTicketsPayload,
  requireAuth: true,
}))
