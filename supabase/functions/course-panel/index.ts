// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseCoursePanelPayload } from './payload.ts'
import { createCoursePanelRepository } from './repository.ts'
import {
  authorizeCoursePanelAction,
  executeCoursePanel,
} from './service.ts'

const repository = createCoursePanelRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = await executeCoursePanel(repository, user.id, body)
  return apiSuccessResponse(result, correlationId)
}, {
  authorize: ({ body, user }) => authorizeCoursePanelAction(repository, user.id, body),
  maxBodyBytes: 4 * 1024,
  parseBody: parseCoursePanelPayload,
  requireAuth: true,
}))
