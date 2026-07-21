// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseBackgroundJobsPayload } from './payload.ts'
import { createBackgroundJobsRepository } from './repository.ts'
import { authorizeBackgroundJobs, executeBackgroundJobs } from './service.ts'

const repository = createBackgroundJobsRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  return apiSuccessResponse(
    await executeBackgroundJobs(repository, user.id, body),
    correlationId,
  )
}, {
  authorize: ({ body, user }) => authorizeBackgroundJobs(repository, user.id, body),
  maxBodyBytes: 32 * 1024,
  parseBody: parseBackgroundJobsPayload,
  requireAuth: true,
}))
