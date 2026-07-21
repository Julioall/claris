// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseAccessControlPayload } from './payload.ts'
import { createAccessControlRepository } from './repository.ts'
import { authorizeAccessControl, executeAccessControl } from './service.ts'

const repository = createAccessControlRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = await executeAccessControl(repository, user.id, body)
  return apiSuccessResponse(result, correlationId)
}, {
  authorize: ({ body, user }) => authorizeAccessControl(repository, user.id, body),
  maxBodyBytes: 16 * 1024,
  parseBody: parseAccessControlPayload,
  requireAuth: true,
}))
