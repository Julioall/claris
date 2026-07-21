// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseCampaignsPayload } from './payload.ts'
import { createCampaignsRepository } from './repository.ts'
import {
  authorizeCampaigns,
  executeCampaigns,
} from './service.ts'

const repository = createCampaignsRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const data = await executeCampaigns(repository, user.id, body)
  return apiSuccessResponse(data, correlationId)
}, {
  authorize: ({ body, user }) => authorizeCampaigns(repository, user.id, body),
  maxBodyBytes: 16 * 1024 * 1024,
  parseBody: parseCampaignsPayload,
  requireAuth: true,
}))
