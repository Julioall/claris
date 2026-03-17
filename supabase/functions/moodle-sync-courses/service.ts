import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import {
  listLinkedCourseIds,
  upsertCourses,
  upsertUserCourseLinks,
} from '../_shared/domain/moodle-sync/repository.ts'
import {
  findUserById,
  findUserByMoodleUserId,
  touchUserLastSync,
} from '../_shared/domain/users/repository.ts'
import { getUserCourses, getCategories, buildCategoryPath } from '../_shared/moodle/mod.ts'

export async function syncCourses(moodleUrl: string, token: string, userId: string): Promise<Response> {
  const supabase = createServiceClient()

  const dbUser = await findUserByMoodleUserId(supabase, userId)

  if (!dbUser) return errorResponse('User not found in database', 404)

  const numericUserId = parseInt(userId, 10)
  const moodleCourses = await getUserCourses(moodleUrl, token, numericUserId)
  console.log(`Found ${moodleCourses.length} courses for user ${userId}`)

  const categories = await getCategories(moodleUrl, token)
  console.log(`Found ${categories.length} categories`)

  const now = new Date().toISOString()

  const coursesData = moodleCourses.map((course) => {
    let categoryName: string | null = null
    if (course.category && categories.length > 0) {
      categoryName = buildCategoryPath(course.category, categories)
    }
    if (!categoryName && course.category) {
      categoryName = String(course.category)
    }

    return {
      moodle_course_id: String(course.id),
      name: course.fullname,
      short_name: course.shortname,
      category: categoryName,
      start_date: course.startdate ? new Date(course.startdate * 1000).toISOString() : null,
      end_date: course.enddate ? new Date(course.enddate * 1000).toISOString() : null,
      last_sync: now,
      updated_at: now,
    }
  })

  try {
    const syncedCourses = await upsertCourses(supabase, coursesData)
    return jsonResponse({ success: true, courses: syncedCourses || [] })
  } catch (upsertError) {
    console.error('Error upserting courses:', upsertError)
    return errorResponse('Failed to sync courses', 500)
  }
}

export async function linkSelectedCourses(userId: string, selectedCourseIds: string[]): Promise<Response> {
  const supabase = createServiceClient()

  const linkUser = await findUserById(supabase, userId)

  if (!linkUser) return errorResponse('User not found', 404)

  const existingLinks = await listLinkedCourseIds(supabase, linkUser.id)
  const existingCourseIds = new Set<string>(existingLinks)

  // Add newly selected
  const toAdd = selectedCourseIds.filter((id) => !existingCourseIds.has(id))
  if (toAdd.length > 0) {
    const links = toAdd.map((course_id) => ({ user_id: linkUser.id, course_id, role: 'tutor' }))
    const BATCH = 100
    for (let i = 0; i < links.length; i += BATCH) {
      await upsertUserCourseLinks(supabase, links.slice(i, i + BATCH))
    }
  }

  await touchUserLastSync(supabase, linkUser.id, new Date().toISOString())

  console.log(`Linked ${toAdd.length} courses for user ${linkUser.id}`)
  return jsonResponse({ success: true, added: toAdd.length, removed: 0 })
}
