import { createHandler } from '../_shared/http/mod.ts'
import { errorResponse } from '../_shared/http/mod.ts'
import { syncCourses, linkSelectedCourses } from './service.ts'

Deno.serve(createHandler(async ({ body }) => {
  const { action } = body as { action?: string }

  if (action === 'link_selected_courses') {
    const { userId, selectedCourseIds } = body as { userId?: string; selectedCourseIds?: string[] }
    if (!userId || !selectedCourseIds || !Array.isArray(selectedCourseIds)) {
      return errorResponse('Missing required fields: userId, selectedCourseIds')
    }
    return await linkSelectedCourses(String(userId), selectedCourseIds)
  }

  // Default: sync_courses
  const { moodleUrl, token, userId } = body as Record<string, string>
  if (!moodleUrl || !token || !userId) {
    return errorResponse('Missing required fields: moodleUrl, token, userId')
  }
  return await syncCourses(moodleUrl, token, userId)
}))
