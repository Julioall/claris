import { createHandler } from '../_shared/http/mod.ts'
import { syncCourses, linkSelectedCourses } from './service.ts'
import { parseMoodleSyncCoursesPayload } from './payload.ts'

Deno.serve(createHandler(async ({ body, user }) => {
  if (body.action === 'link_selected_courses') {
    return await linkSelectedCourses(user.id, body.selectedCourseIds)
  }

  return await syncCourses(body.moodleUrl, body.token, body.userId)
}, { requireAuth: true, parseBody: parseMoodleSyncCoursesPayload }))
