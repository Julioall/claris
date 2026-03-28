import { isApplicationAdmin, userHasCourseAccess, userHasPermission } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { findCourseByMoodleCourseId } from '../_shared/domain/moodle-sync/repository.ts'
import { createHandler, errorResponse } from '../_shared/http/mod.ts'
import { syncGrades, debugGrades } from './service.ts'
import { parseMoodleSyncGradesPayload } from './payload.ts'

Deno.serve(createHandler(async ({ body, user }) => {
  const supabase = createServiceClient()

  if (body.action === 'debug_grades') {
    const isAdmin = await isApplicationAdmin(supabase, user.id)
    if (!isAdmin) {
      return errorResponse('Only administrators can debug grade payloads.', 403)
    }

    return await debugGrades(body.moodleUrl, body.token, body.courseId, body.userId)
  }

  const canViewCoursePanel = await userHasPermission(supabase, user.id, 'courses.panel.view')
  if (!canViewCoursePanel) {
    return errorResponse('Permission denied for Moodle grade sync.', 403)
  }

  const course = await findCourseByMoodleCourseId(supabase, String(body.courseId))
  if (!course) return errorResponse('Course not found in database', 404)

  const hasCourseAccess = await userHasCourseAccess(supabase, user.id, course.id)
  if (!hasCourseAccess) {
    return errorResponse('Forbidden for this course.', 403)
  }

  return await syncGrades(body.moodleUrl, body.token, body.courseId)
}, { requireAuth: true, parseBody: parseMoodleSyncGradesPayload }))
