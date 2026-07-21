// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { ACADEMIC_REPORTS_MAX_BODY_BYTES } from './contract.ts'
import { parseAcademicReportsPayload } from './payload.ts'
import { createAcademicReportsRepository } from './repository.ts'
import {
  authorizeAcademicReportsAction,
  executeAcademicReportsAction,
} from './service.ts'

const repository = createAcademicReportsRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = await executeAcademicReportsAction(repository, user.id, body)
  return apiSuccessResponse(result, correlationId)
}, {
  authorize: ({ body, user }) => authorizeAcademicReportsAction(repository, user.id, body),
  maxBodyBytes: ACADEMIC_REPORTS_MAX_BODY_BYTES,
  parseBody: parseAcademicReportsPayload,
  requireAuth: true,
}))
