// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import {
  apiSuccessResponse,
  createHandler,
} from '../_shared/http/mod.ts'
import { APP_TELEMETRY_MAX_BODY_BYTES } from './contract.ts'
import { parseAppTelemetryPayload } from './payload.ts'
import { createAppTelemetryRepository } from './repository.ts'
import { recordAppTelemetry } from './service.ts'

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = await recordAppTelemetry(
    createAppTelemetryRepository(),
    user.id,
    body,
  )
  return apiSuccessResponse(result, correlationId)
}, {
  maxBodyBytes: APP_TELEMETRY_MAX_BODY_BYTES,
  parseBody: parseAppTelemetryPayload,
  requireAuth: true,
}))
