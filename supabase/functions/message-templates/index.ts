// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseMessageTemplatesPayload } from './payload.ts'
import { createMessageTemplatesRepository } from './repository.ts'
import {
  authorizeMessageTemplates,
  executeMessageTemplates,
} from './service.ts'

const repository = createMessageTemplatesRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const data = await executeMessageTemplates(repository, user.id, body)
  return apiSuccessResponse(data, correlationId)
}, {
  authorize: ({ body, user }) => authorizeMessageTemplates(repository, user.id, body),
  maxBodyBytes: 32 * 1024,
  parseBody: parseMessageTemplatesPayload,
  requireAuth: true,
}))
