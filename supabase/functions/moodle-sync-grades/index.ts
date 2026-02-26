import { createHandler } from '../_shared/http/mod.ts'
import { errorResponse } from '../_shared/http/mod.ts'
import { syncGrades, debugGrades } from './service.ts'

Deno.serve(createHandler(async ({ body }) => {
  const { action, moodleUrl, token, courseId, userId } = body as Record<string, string | number>

  if (action === 'debug_grades') {
    if (!moodleUrl || !token || !courseId || !userId) {
      return errorResponse('Missing required fields: moodleUrl, token, courseId, userId')
    }
    return await debugGrades(String(moodleUrl), String(token), Number(courseId), Number(userId))
  }

  // Default: sync_grades
  if (!moodleUrl || !token || !courseId) {
    return errorResponse('Missing required fields: moodleUrl, token, courseId')
  }
  return await syncGrades(String(moodleUrl), String(token), Number(courseId))
}))
