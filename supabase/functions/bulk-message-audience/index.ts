// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseBulkMessageAudiencePayload } from './payload.ts'
import { createBulkMessageAudienceRepository } from './repository.ts'
import {
  authorizeBulkMessageAudience,
  executeBulkMessageAudience,
} from './service.ts'

const repository = createBulkMessageAudienceRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const data = await executeBulkMessageAudience(repository, user.id, body)
  return apiSuccessResponse(data, correlationId)
}, {
  authorize: ({ body, user }) => authorizeBulkMessageAudience(repository, user.id, body),
  maxBodyBytes: 2 * 1024,
  parseBody: parseBulkMessageAudiencePayload,
  requireAuth: true,
}))
