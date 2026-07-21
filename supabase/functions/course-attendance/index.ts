// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { parseCourseAttendancePayload } from './payload.ts'
import { createCourseAttendanceRepository } from './repository.ts'
import { executeCourseAttendance } from './service.ts'

const repository = createCourseAttendanceRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = await executeCourseAttendance(repository, user.id, body)
  return apiSuccessResponse(result, correlationId)
}, {
  authorize: async ({ body, user }) => body.action === 'save_sheet'
    ? repository.userCanManageAttendance(user.id)
    : repository.userCanViewPanel(user.id),
  maxBodyBytes: 256 * 1024,
  parseBody: parseCourseAttendancePayload,
  requireAuth: true,
}))
