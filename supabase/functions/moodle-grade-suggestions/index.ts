import { createHandler } from '../_shared/http/mod.ts'
import { userHasPermission } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { errorResponse } from '../_shared/http/mod.ts'
import { parseMoodleGradeSuggestionPayload } from './payload.ts'
import { handleGradeSuggestionRequest } from './service.ts'

Deno.serve(createHandler(async ({ body, user }) => {
  const supabase = createServiceClient()
  const canManageGradeSuggestions = await userHasPermission(supabase, user.id, 'grades.suggestions.manage')

  if (!canManageGradeSuggestions) {
    return errorResponse('Permission denied for AI grade suggestions.', 403)
  }

  return await handleGradeSuggestionRequest(body, user.id)
}, { requireAuth: true, parseBody: parseMoodleGradeSuggestionPayload }))
