// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseDashboardSummaryPayload } from './payload.ts'
import { createDashboardSummaryRepository } from './repository.ts'
import { getDashboardSummary } from './service.ts'

const repository = createDashboardSummaryRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = await getDashboardSummary(repository, user.id, body)
  return apiSuccessResponse(result, correlationId)
}, {
  authorize: ({ user }) => repository.userCanViewDashboard(user.id),
  maxBodyBytes: 4 * 1024,
  parseBody: parseDashboardSummaryPayload,
  requireAuth: true,
}))
