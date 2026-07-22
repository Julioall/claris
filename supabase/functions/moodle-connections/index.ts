// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseMoodleConnectionsPayload } from './payload.ts'
import { createMoodleConnectionsRepository } from './repository.ts'
import { executeMoodleConnectionsAction } from './service.ts'

const repository = createMoodleConnectionsRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = await executeMoodleConnectionsAction(repository, user.id, body)
  return apiSuccessResponse(result, correlationId)
}, {
  maxBodyBytes: 4 * 1024,
  parseBody: parseMoodleConnectionsPayload,
  requireAuth: true,
}))
