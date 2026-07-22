// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { isApplicationAdmin } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseClarisInvitationsPayload } from './payload.ts'
import { createClarisInvitationsRepository } from './repository.ts'
import { executeClarisInvitationAction } from './service.ts'

const serviceClient = createServiceClient()
const repository = createClarisInvitationsRepository(serviceClient)

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = await executeClarisInvitationAction(repository, serviceClient, user, body)
  return apiSuccessResponse(result, correlationId)
}, {
  authorize: async ({ body, user }) => body.action === 'provision_account'
    || await isApplicationAdmin(serviceClient, user.id),
  maxBodyBytes: 4 * 1024,
  parseBody: parseClarisInvitationsPayload,
  requireAuth: true,
}))
