// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseClarisSuggestionsPayload } from './payload.ts'
import { createClarisSuggestionsRepository } from './repository.ts'
import {
  authorizeClarisSuggestions,
  executeClarisSuggestions,
} from './service.ts'

const repository = createClarisSuggestionsRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  return apiSuccessResponse(
    await executeClarisSuggestions(repository, user.id, body),
    correlationId,
  )
}, {
  authorize: ({ user }) => authorizeClarisSuggestions(repository, user.id),
  maxBodyBytes: 16 * 1024,
  parseBody: parseClarisSuggestionsPayload,
  requireAuth: true,
}))
