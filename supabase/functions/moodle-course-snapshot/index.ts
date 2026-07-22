// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { createServiceClient } from '../_shared/db/mod.ts'
import { userHasPermission } from '../_shared/auth/mod.ts'
import { apiSuccessResponse, createHandler, jsonResponse } from '../_shared/http/mod.ts'
import { scheduleMoodleSyncJob } from '../_shared/domain/moodle-sync/job-runner.ts'
import { parseMoodleCourseSnapshotPayload } from './payload.ts'
import { createSnapshotRepository } from './repository.ts'
import { executeMoodleCourseSnapshot } from './service.ts'

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const repository = createSnapshotRepository(createServiceClient())
  const result = await executeMoodleCourseSnapshot(repository, user.id, body)
  const jobId = typeof result.body.jobId === 'string'
    ? result.body.jobId
    : result.body.refresh && typeof result.body.refresh === 'object' && !Array.isArray(result.body.refresh)
    && typeof result.body.refresh.jobId === 'string'
    ? result.body.refresh.jobId
    : null
  if (jobId && result.status !== 429) scheduleMoodleSyncJob(jobId)
  if (result.status === 429) {
    return jsonResponse(
      { error: { ...result.body, correlationId } },
      429,
      { 'Retry-After': String(result.retryAfterSeconds ?? 60) },
    )
  }
  return apiSuccessResponse(result.body, correlationId, result.status)
}, {
  authorize: async ({ user }) => userHasPermission(createServiceClient(), user.id, 'courses.panel.view'),
  maxBodyBytes: 16 * 1024,
  parseBody: parseMoodleCourseSnapshotPayload,
  requireAuth: true,
}))

