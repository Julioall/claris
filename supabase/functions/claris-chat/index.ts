// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { createServiceClient } from '../_shared/db/mod.ts'
import {
  ApiError,
  apiSuccessResponse,
  createHandler,
} from '../_shared/http/mod.ts'
import { parseClarisChatPayload } from './payload.ts'
import { createClarisChatRepository } from './repository.ts'
import { executeClarisChat } from './service.ts'
import {
  getClarisAvailabilityStatus,
  toClarisAvailabilityDto,
  toClarisChatResponseDto,
} from './rules.ts'

const supabase = createServiceClient()
const repository = createClarisChatRepository(supabase)

Deno.serve(createHandler(async ({ body, correlationId, logger, user }) => {
  const settings = await repository.readSettings()

  if (body.operation === 'get_availability') {
    return apiSuccessResponse(toClarisAvailabilityDto(settings), correlationId)
  }

  const availability = getClarisAvailabilityStatus(settings)
  if (availability !== 'ready') {
    throw ApiError.conflict('Claris IA not configured globally.', { availability })
  }

  try {
    const result = await executeClarisChat(settings, body, user.id, body.connectionId)
    if (!result.reply) {
      throw new ApiError('upstream_empty_response', 'LLM returned an empty response.', 502)
    }
    return apiSuccessResponse(toClarisChatResponseDto(result), correlationId)
  } catch (error) {
    if (error instanceof ApiError) throw error

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('upstream_timeout', 'LLM chat request timeout.', 408)
    }

    logger.error('claris_chat_upstream_error', error)
    throw new ApiError('upstream_error', 'LLM chat request failed.', 502)
  }
}, {
  authorize: ({ user }) => repository.userCanUseClaris(user.id),
  maxBodyBytes: 128 * 1024,
  parseBody: parseClarisChatPayload,
  requireAuth: true,
}))
