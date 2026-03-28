import { userHasCourseAccess, userHasPermission } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { findCourseByMoodleCourseId } from '../_shared/domain/moodle-sync/repository.ts'
import { createHandler, errorResponse } from '../_shared/http/mod.ts'
import { syncActivities } from './service.ts'
import { parseMoodleSyncActivitiesPayload } from './payload.ts'

Deno.serve(createHandler(async ({ body, user }) => {
  const supabase = createServiceClient()
  const canViewCoursePanel = await userHasPermission(supabase, user.id, 'courses.panel.view')

  if (!canViewCoursePanel) {
    return errorResponse('Permission denied for Moodle activity sync.', 403)
  }

  const course = await findCourseByMoodleCourseId(supabase, String(body.courseId))
  if (!course) return errorResponse('Course not found in database', 404)

  const hasCourseAccess = await userHasCourseAccess(supabase, user.id, course.id)
  if (!hasCourseAccess) {
    return errorResponse('Forbidden for this course.', 403)
  }

  return await syncActivities(body.moodleUrl, body.token, body.courseId)
}, { requireAuth: true, parseBody: parseMoodleSyncActivitiesPayload }))
