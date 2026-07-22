import { userHasCourseAccess, userHasPermission } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { findCourseById } from '../_shared/domain/moodle-sync/repository.ts'
import { MoodleConnectionError, resolveMoodleAccess } from '../_shared/domain/moodle-connections/mod.ts'
import { createHandler, errorResponse } from '../_shared/http/mod.ts'
import { syncStudents } from './service.ts'
import { parseMoodleSyncStudentsPayload } from './payload.ts'

Deno.serve(createHandler(async ({ body, user }) => {
  const supabase = createServiceClient()
  const [canViewStudents, canViewCoursePanel] = await Promise.all([
    userHasPermission(supabase, user.id, 'students.view'),
    userHasPermission(supabase, user.id, 'courses.panel.view'),
  ])

  if (!canViewStudents && !canViewCoursePanel) {
    return errorResponse('Permission denied for Moodle student sync.', 403)
  }

  let access
  try {
    access = await resolveMoodleAccess(supabase, user.id, body.connectionId)
  } catch (error) {
    if (error instanceof MoodleConnectionError) {
      return errorResponse(error.message, error.code === 'connection_not_found' ? 404 : 409)
    }
    throw error
  }

  const course = await findCourseById(supabase, body.courseId)
  if (!course) return errorResponse('Course not found in database', 404)
  if (course.moodle_site_id !== access.moodleSiteId) {
    return errorResponse('Course is outside Moodle connection site.', 403)
  }

  const hasCourseAccess = await userHasCourseAccess(supabase, user.id, course.id)
  if (!hasCourseAccess) {
    return errorResponse('Forbidden for this course.', 403)
  }

  return await syncStudents(access, course)
}, { requireAuth: true, parseBody: parseMoodleSyncStudentsPayload }))
