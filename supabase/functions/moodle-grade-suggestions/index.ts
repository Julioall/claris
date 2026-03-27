import { createHandler } from '../_shared/http/mod.ts'
import { parseMoodleGradeSuggestionPayload } from './payload.ts'
import { handleGradeSuggestionRequest } from './service.ts'

Deno.serve(createHandler(async ({ body, user }) => {
  return await handleGradeSuggestionRequest(body, user.id)
}, { requireAuth: true, parseBody: parseMoodleGradeSuggestionPayload }))
