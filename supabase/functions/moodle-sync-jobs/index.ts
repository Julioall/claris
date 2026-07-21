// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseMoodleSyncJobsPayload } from './payload.ts'
import { createMoodleSyncJobsRepository } from './repository.ts'
import { moodleSyncJobsRuntime } from './runtime.ts'
import {
  authorizeMoodleSyncJobs,
  executeMoodleSyncJobs,
} from './service.ts'

const repository = createMoodleSyncJobsRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = await executeMoodleSyncJobs(repository, user.id, body, moodleSyncJobsRuntime)
  return apiSuccessResponse(result, correlationId)
}, {
  authorize: ({ body, user }) => authorizeMoodleSyncJobs(repository, user.id, body),
  maxBodyBytes: 128 * 1024,
  parseBody: parseMoodleSyncJobsPayload,
  requireAuth: true,
}))
