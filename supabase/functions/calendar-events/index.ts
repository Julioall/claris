// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseCalendarEventsPayload } from './payload.ts'
import { createCalendarEventsRepository } from './repository.ts'
import {
  authorizeCalendarEventsAction,
  executeCalendarEvents,
} from './service.ts'

const repository = createCalendarEventsRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = await executeCalendarEvents(repository, user.id, body)
  return apiSuccessResponse(result, correlationId)
}, {
  authorize: ({ body, user }) => authorizeCalendarEventsAction(repository, user.id, body),
  maxBodyBytes: 16 * 1024,
  parseBody: parseCalendarEventsPayload,
  requireAuth: true,
}))
