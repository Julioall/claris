// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { createEvolutionInstanceGateway } from './evolution-gateway.ts'
import { parseServiceIntegrationPayload } from './payload.ts'
import { createServiceInstanceRepository } from './repository.ts'
import { authorizeServiceIntegration, executeServiceIntegration } from './service.ts'

const repository = createServiceInstanceRepository()
const evolution = createEvolutionInstanceGateway()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = await executeServiceIntegration(
    repository,
    evolution,
    user.id,
    correlationId,
    body,
  )
  return apiSuccessResponse(result, correlationId)
}, {
  authorize: ({ user }) => authorizeServiceIntegration(repository, user.id),
  maxBodyBytes: 16 * 1024,
  parseBody: parseServiceIntegrationPayload,
  requireAuth: true,
}))
