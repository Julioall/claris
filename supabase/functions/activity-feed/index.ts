// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseActivityFeedPayload } from './payload.ts'
import { createActivityFeedRepository } from './repository.ts'
import { getActivityFeed } from './service.ts'

const repository = createActivityFeedRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  return apiSuccessResponse(
    await getActivityFeed(repository, user.id, body),
    correlationId,
  )
}, {
  maxBodyBytes: 4 * 1024,
  parseBody: parseActivityFeedPayload,
  requireAuth: true,
}))
