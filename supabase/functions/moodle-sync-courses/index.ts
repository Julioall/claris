import { createHandler, errorResponse } from '../_shared/http/mod.ts'
import { isApplicationAdmin, userHasPermission } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { findUserById } from '../_shared/domain/users/repository.ts'
import { syncCourses, linkSelectedCourses, syncProjectCatalog, listMoodleCategories } from './service.ts'
import { parseMoodleSyncCoursesPayload } from './payload.ts'

Deno.serve(createHandler(async ({ body, user }) => {
  const supabase = createServiceClient()
  const canAccessCourses = await userHasPermission(supabase, user.id, 'courses.catalog.view')

  if (!canAccessCourses) {
    return errorResponse('Permission denied for Moodle course sync.', 403)
  }

  if (body.action === 'link_selected_courses') {
    return await linkSelectedCourses(user.id, body.selectedCourseIds)
  }

  if (body.action === 'list_moodle_categories') {
    const isAdmin = await isApplicationAdmin(supabase, user.id)
    if (!isAdmin) {
      return errorResponse('Only application admins can list Moodle categories.', 403)
    }
    return await listMoodleCategories(body.token)
  }

  if (body.action === 'sync_project_catalog') {
    const isAdmin = await isApplicationAdmin(supabase, user.id)
    if (!isAdmin) {
      return errorResponse('Only application admins can run project-wide Moodle sync.', 403)
    }

    return await syncProjectCatalog(body.moodleUrl, body.token, user.id, body.categoryIds)
  }

  const dbUser = await findUserById(supabase, user.id)
  const authenticatedMoodleUserId = dbUser?.moodle_user_id ? String(dbUser.moodle_user_id) : null

  if (!authenticatedMoodleUserId) {
    return errorResponse('Authenticated user has no Moodle profile.', 409)
  }

  if (String(body.userId) !== authenticatedMoodleUserId) {
    return errorResponse('Forbidden for another Moodle user.', 403)
  }

  return await syncCourses(body.moodleUrl, body.token, authenticatedMoodleUserId)
}, { requireAuth: true, parseBody: parseMoodleSyncCoursesPayload }))
