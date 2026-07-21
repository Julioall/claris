// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import {
  apiSuccessResponse,
  createHandler,
  isApiV1Request,
  jsonResponse,
} from '../_shared/http/mod.ts'
import { parseMoodleReauthSettingsPayload } from './payload.ts'
import { createMoodleReauthSettingsRepository } from './repository.ts'
import { getMoodleReauthSettings, updateMoodleReauthSettings } from './service.ts'

Deno.serve(createHandler(async ({ body, correlationId, req, user }) => {
  const repository = createMoodleReauthSettingsRepository()
  const result = body.action === 'get_settings'
    ? await getMoodleReauthSettings(repository, user.id)
    : await updateMoodleReauthSettings(repository, user.id, body.enabled)

  return isApiV1Request(req)
    ? apiSuccessResponse(result, correlationId)
    : jsonResponse(result)
}, {
  parseBody: parseMoodleReauthSettingsPayload,
  requireAuth: true,
}))
