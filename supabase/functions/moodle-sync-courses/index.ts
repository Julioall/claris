import { createHandler, errorResponse } from '../_shared/http/mod.ts'
import { userHasPermission } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import {
  MoodleConnectionError,
  resolveMoodleAccess,
} from '../_shared/domain/moodle-connections/mod.ts'
import { syncCourses, linkSelectedCourses } from './service.ts'
import { parseMoodleSyncCoursesPayload } from './payload.ts'

Deno.serve(createHandler(async ({ body, user }) => {
  const supabase = createServiceClient()
  const canAccessCourses = await userHasPermission(supabase, user.id, 'courses.catalog.view')

  if (!canAccessCourses) {
    return errorResponse('Permission denied for Moodle course sync.', 403)
  }

  if (body.action === 'link_selected_courses') {
    return await linkSelectedCourses(user.id, body.connectionId, body.selectedCourseIds)
  }

  try {
    const access = await resolveMoodleAccess(supabase, user.id, body.connectionId)
    return await syncCourses(access)
  } catch (error) {
    if (error instanceof MoodleConnectionError) {
      const status = error.code === 'connection_not_found' ? 404 : 409
      return errorResponse(error.message, status)
    }
    throw error
  }
}, { requireAuth: true, parseBody: parseMoodleSyncCoursesPayload }))
