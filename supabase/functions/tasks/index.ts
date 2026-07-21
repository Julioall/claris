// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseTasksPayload } from './payload.ts'
import { createTasksRepository } from './repository.ts'
import {
  authorizeTasksAction,
  executeTasks,
} from './service.ts'

const repository = createTasksRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = await executeTasks(repository, user.id, body)
  return apiSuccessResponse(result, correlationId)
}, {
  authorize: ({ body, user }) => authorizeTasksAction(repository, user.id, body),
  maxBodyBytes: 16 * 1024,
  parseBody: parseTasksPayload,
  requireAuth: true,
}))
