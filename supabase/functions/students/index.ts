// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseStudentsPayload } from './payload.ts'
import { createStudentsRepository } from './repository.ts'
import {
  authorizeStudentsAction,
  executeStudents,
} from './service.ts'

const repository = createStudentsRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = await executeStudents(repository, user.id, body)
  return apiSuccessResponse(result, correlationId)
}, {
  authorize: ({ body, user }) => authorizeStudentsAction(repository, user.id, body),
  maxBodyBytes: 8 * 1024,
  parseBody: parseStudentsPayload,
  requireAuth: true,
}))
