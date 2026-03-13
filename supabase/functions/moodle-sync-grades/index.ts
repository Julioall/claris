import { createHandler } from '../_shared/http/mod.ts'
import { syncGrades, debugGrades } from './service.ts'
import { parseMoodleSyncGradesPayload } from './payload.ts'

Deno.serve(createHandler(async ({ body }) => {
  if (body.action === 'debug_grades') {
    return await debugGrades(body.moodleUrl, body.token, body.courseId, body.userId)
  }

  return await syncGrades(body.moodleUrl, body.token, body.courseId)
}, { requireAuth: true, parseBody: parseMoodleSyncGradesPayload }))
