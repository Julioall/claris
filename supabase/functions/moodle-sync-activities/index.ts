import { createHandler } from '../_shared/http/mod.ts'
import { syncActivities } from './service.ts'
import { parseMoodleSyncActivitiesPayload } from './payload.ts'

Deno.serve(createHandler(async ({ body }) => {
  return await syncActivities(body.moodleUrl, body.token, body.courseId)
}, { requireAuth: true, parseBody: parseMoodleSyncActivitiesPayload }))
