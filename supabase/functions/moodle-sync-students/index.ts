import { userHasCourseAccess, userHasPermission } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { findCourseByMoodleCourseId } from '../_shared/domain/moodle-sync/repository.ts'
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

  const course = await findCourseByMoodleCourseId(supabase, String(body.courseId))
  if (!course) return errorResponse('Course not found in database', 404)

  const hasCourseAccess = await userHasCourseAccess(supabase, user.id, course.id)
  if (!hasCourseAccess) {
    return errorResponse('Forbidden for this course.', 403)
  }

  return await syncStudents(body.moodleUrl, body.token, body.courseId)
}, { requireAuth: true, parseBody: parseMoodleSyncStudentsPayload }))
