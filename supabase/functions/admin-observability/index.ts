// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseAdminObservabilityPayload } from './payload.ts'
import { createAdminObservabilityRepository } from './repository.ts'
import { executeAdminObservability, getAdminDashboardSummary } from './service.ts'

const repository = createAdminObservabilityRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = body.action === 'get_dashboard'
    ? await getAdminDashboardSummary(repository)
    : await executeAdminObservability(repository, user.id, body)
  return apiSuccessResponse(result, correlationId)
}, {
  authorize: ({ user }) => repository.isApplicationAdmin(user.id),
  maxBodyBytes: 32 * 1024,
  parseBody: parseAdminObservabilityPayload,
  requireAuth: true,
}))
