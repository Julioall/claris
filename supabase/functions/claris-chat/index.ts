// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { createServiceClient } from '../_shared/db/mod.ts'
import { resolveMoodleAccess, type MoodleAccess } from '../_shared/domain/moodle-reauth/access.ts'
import {
  ApiError,
  apiSuccessResponse,
  createHandler,
  errorResponse,
  jsonResponse,
} from '../_shared/http/mod.ts'
import { parseClarisChatPayload } from './payload.ts'
import { createClarisChatRepository } from './repository.ts'
import { executeClarisChat } from './service.ts'
import {
  getClarisAvailabilityStatus,
  shouldResolveMoodleAccess,
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
    if (body.requestVersion === 'v1') {
      throw ApiError.conflict('Claris IA not configured globally.', { availability })
    }
    return errorResponse('Claris IA not configured globally.', 400)
  }

  let moodleAccess: MoodleAccess | undefined
  if (body.requestVersion === 'legacy' && body.moodleUrl && body.moodleToken) {
    moodleAccess = { moodleUrl: body.moodleUrl, token: body.moodleToken }
  } else if (body.requestVersion === 'v1' && shouldResolveMoodleAccess(body)) {
    try {
      moodleAccess = await resolveMoodleAccess(supabase, user.id)
    } catch {
      logger.info('moodle_access_unavailable', { actorId: user.id })
    }
  }

  try {
    const result = await executeClarisChat(settings, body, user.id, moodleAccess)
    if (!result.reply) {
      if (body.requestVersion === 'v1') {
        throw new ApiError('upstream_empty_response', 'LLM returned an empty response.', 502)
      }
      return errorResponse('LLM returned an empty response.', 502)
    }

    if (body.requestVersion === 'v1') {
      return apiSuccessResponse(toClarisChatResponseDto(result), correlationId)
    }

    return jsonResponse({
      success: true,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      reply: result.reply,
      uiActions: result.uiActions,
      richBlocks: result.richBlocks,
    })
  } catch (error) {
    if (error instanceof ApiError) throw error

    if (error instanceof Error && error.name === 'AbortError') {
      if (body.requestVersion === 'v1') {
        throw new ApiError('upstream_timeout', 'LLM chat request timeout.', 408)
      }
      return errorResponse('LLM chat request timeout.', 408)
    }

    if (body.requestVersion === 'v1') {
      logger.error('claris_chat_upstream_error', error)
      throw new ApiError('upstream_error', 'LLM chat request failed.', 502)
    }
    return errorResponse(
      error instanceof Error ? `LLM chat request failed: ${error.message}` : 'LLM chat request failed.',
      500,
    )
  }
}, {
  authorize: ({ user }) => repository.userCanUseClaris(user.id),
  maxBodyBytes: 128 * 1024,
  parseBody: parseClarisChatPayload,
  requireAuth: true,
}))
