import { createHandler } from '../_shared/http/mod.ts'
import { syncStudents } from './service.ts'
import { parseMoodleSyncStudentsPayload } from './payload.ts'

Deno.serve(createHandler(async ({ body }) => {
  return await syncStudents(body.moodleUrl, body.token, body.courseId)
}, { requireAuth: true, parseBody: parseMoodleSyncStudentsPayload }))
