import { createHandler } from '../_shared/http/mod.ts'
import { errorResponse } from '../_shared/http/mod.ts'
import { syncActivities } from './service.ts'

Deno.serve(createHandler(async ({ body }) => {
  const { moodleUrl, token, courseId } = body as Record<string, string | number>

  if (!moodleUrl || !token || !courseId) {
    return errorResponse('Missing required fields: moodleUrl, token, courseId')
  }

  return await syncActivities(String(moodleUrl), String(token), Number(courseId))
}, { requireAuth: true }))
