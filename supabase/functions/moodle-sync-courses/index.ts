import { createHandler } from '../_shared/http/mod.ts'
import { errorResponse } from '../_shared/http/mod.ts'
import { syncCourses, linkSelectedCourses } from './service.ts'

Deno.serve(createHandler(async ({ body, user }) => {
  const { action } = body as { action?: string }

  if (action === 'link_selected_courses') {
    const { selectedCourseIds } = body as { selectedCourseIds?: string[] }
    if (!selectedCourseIds || !Array.isArray(selectedCourseIds)) {
      return errorResponse('Missing required fields: selectedCourseIds')
    }
    return await linkSelectedCourses(user.id, selectedCourseIds)
  }

  // Default: sync_courses
  const { moodleUrl, token, userId } = body as Record<string, string>
  if (!moodleUrl || !token || !userId) {
    return errorResponse('Missing required fields: moodleUrl, token, userId')
  }
  return await syncCourses(moodleUrl, token, userId)
}, { requireAuth: true }))
