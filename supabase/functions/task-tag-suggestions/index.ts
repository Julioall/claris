// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseTaskTagSuggestionsPayload } from './payload.ts'
import { createTaskTagSuggestionsRepository } from './repository.ts'
import { searchTaskTagSuggestions } from './service.ts'

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = await searchTaskTagSuggestions(
    createTaskTagSuggestionsRepository(),
    user.id,
    body,
  )

  return apiSuccessResponse(result, correlationId)
}, {
  maxBodyBytes: 4 * 1024,
  parseBody: parseTaskTagSuggestionsPayload,
  requireAuth: true,
}))
