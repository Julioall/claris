// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { GRADE_SUGGESTION_JOBS_MAX_BODY_BYTES } from './contract.ts'
import { parseGradeSuggestionJobsPayload } from './payload.ts'
import { createGradeSuggestionJobsRepository } from './repository.ts'
import {
  authorizeGradeSuggestionJobsAction,
  findLatestRelevantGradeSuggestionJob,
} from './service.ts'

const repository = createGradeSuggestionJobsRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = await findLatestRelevantGradeSuggestionJob(repository, user.id, body)
  return apiSuccessResponse(result, correlationId)
}, {
  authorize: ({ body, user }) => authorizeGradeSuggestionJobsAction(repository, user.id, body),
  maxBodyBytes: GRADE_SUGGESTION_JOBS_MAX_BODY_BYTES,
  parseBody: parseGradeSuggestionJobsPayload,
  requireAuth: true,
}))
