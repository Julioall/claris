// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { createServiceClient } from '../_shared/db/mod.ts'
import { resolveMoodleAccess } from '../_shared/domain/moodle-connections/access.ts'
import { resolveOwnedMoodleConnectionScope } from '../_shared/domain/moodle-connections/scope.ts'
import { ApiError, apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseMessagingPayload } from './payload.ts'
import { createMoodleMessagingRepository } from './repository.ts'
import { executeMessaging } from './service.ts'

const supabase = createServiceClient()
const repository = createMoodleMessagingRepository(supabase)

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const scope = await resolveOwnedMoodleConnectionScope(supabase, user.id, body.connectionId)
  if (body.action !== 'get_conversations') {
    await repository.assertAccessibleMoodleUser(user.id, scope.moodleSiteId, body.moodleUserId)
  }
  let access
  try {
    access = await resolveMoodleAccess(supabase, user.id, scope.connectionId)
  } catch (error) {
    throw ApiError.conflict(
      error instanceof Error ? error.message : 'Nao foi possivel acessar o Moodle pelo servidor.',
    )
  }

  return apiSuccessResponse(
    await executeMessaging(repository, user.id, access, body),
    correlationId,
  )
}, {
  authorize: ({ user }) => repository.userCanViewMessages(user.id),
  maxBodyBytes: 16 * 1024,
  parseBody: parseMessagingPayload,
  requireAuth: true,
}))
