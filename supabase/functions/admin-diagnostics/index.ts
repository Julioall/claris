// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { isApplicationAdmin } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { createGradeDiagnosticGateway } from './gateway.ts'
import { parseAdminDiagnosticsPayload } from './payload.ts'
import { createAdminDiagnosticsRepository } from './repository.ts'
import { executeAdminDiagnostics } from './service.ts'

const supabase = createServiceClient()
const repository = createAdminDiagnosticsRepository(supabase)
const gateway = createGradeDiagnosticGateway(supabase)

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  return apiSuccessResponse(
    await executeAdminDiagnostics(repository, gateway, user.id, correlationId, body),
    correlationId,
  )
}, {
  authorize: ({ user }) => isApplicationAdmin(supabase, user.id),
  maxBodyBytes: 8 * 1024,
  parseBody: parseAdminDiagnosticsPayload,
  requireAuth: true,
}))
