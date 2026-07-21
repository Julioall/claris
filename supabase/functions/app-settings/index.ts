// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseAppSettingsPayload } from './payload.ts'
import { createAppSettingsRepository } from './repository.ts'
import {
  getAdminAppSettings,
  getPublicAppSettings,
  updateAppSettings,
} from './service.ts'

const repository = createAppSettingsRepository()

Deno.serve(createHandler(async ({ body, correlationId }) => {
  const result = body.action === 'get_public'
    ? await getPublicAppSettings(repository)
    : body.action === 'get_admin'
      ? await getAdminAppSettings(repository)
      : await updateAppSettings(repository, body)

  return apiSuccessResponse(result, correlationId)
}, {
  authorize: ({ body, user }) => body.action === 'get_public'
    || repository.isApplicationAdmin(user.id),
  maxBodyBytes: 128 * 1024,
  parseBody: parseAppSettingsPayload,
  requireAuth: true,
}))
