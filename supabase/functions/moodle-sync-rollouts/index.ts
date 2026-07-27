// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseMoodleSyncRolloutsPayload } from './payload.ts'
import { createMoodleSyncRolloutsRepository } from './repository.ts'
import { executeMoodleSyncRollouts } from './service.ts'

const repository = createMoodleSyncRolloutsRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = await executeMoodleSyncRollouts(repository, user.id, body)
  return apiSuccessResponse(result, correlationId)
}, {
  authorize: ({ user }) => repository.isApplicationAdmin(user.id),
  maxBodyBytes: 16 * 1024,
  parseBody: parseMoodleSyncRolloutsPayload,
  requireAuth: true,
}))
