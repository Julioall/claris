import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { getUserCourses, getCategories, buildCategoryPath } from '../_shared/moodle/mod.ts'

export async function syncCourses(moodleUrl: string, token: string, userId: string): Promise<Response> {
  const supabase = createServiceClient()

  const { data: dbUser } = await supabase
    .from('users')
    .select('id')
    .eq('moodle_user_id', userId)
    .maybeSingle()

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

  const { data: syncedCourses, error: upsertError } = await supabase
    .from('courses')
    .upsert(coursesData, { onConflict: 'moodle_course_id', ignoreDuplicates: false })
    .select()

  if (upsertError) {
    console.error('Error upserting courses:', upsertError)
    return errorResponse('Failed to sync courses', 500)
  }

  return jsonResponse({ success: true, courses: syncedCourses || [] })
}

export async function linkSelectedCourses(userId: string, selectedCourseIds: string[]): Promise<Response> {
  const supabase = createServiceClient()

  const { data: linkUser } = await supabase
    .from('users')
    .select('id')
    .eq('moodle_user_id', userId)
    .maybeSingle()

  if (!linkUser) return errorResponse('User not found', 404)

  const { data: existingLinks } = await supabase
    .from('user_courses')
    .select('course_id')
    .eq('user_id', linkUser.id)

  const existingCourseIds = new Set<string>(existingLinks?.map((l: { course_id: string }) => l.course_id) || [])
  const selectedSet = new Set<string>(selectedCourseIds)

  // Remove unselected
  const toRemove = Array.from(existingCourseIds).filter((id) => !selectedSet.has(id))
  if (toRemove.length > 0) {
    await supabase.from('user_courses').delete().eq('user_id', linkUser.id).in('course_id', toRemove)
  }

  // Add newly selected
  const toAdd = selectedCourseIds.filter((id) => !existingCourseIds.has(id))
  if (toAdd.length > 0) {
    const links = toAdd.map((course_id) => ({ user_id: linkUser.id, course_id, role: 'tutor' }))
    const BATCH = 100
    for (let i = 0; i < links.length; i += BATCH) {
      await supabase
        .from('user_courses')
        .upsert(links.slice(i, i + BATCH), { onConflict: 'user_id,course_id', ignoreDuplicates: true })
    }
  }

  await supabase.from('users').update({ last_sync: new Date().toISOString() }).eq('id', linkUser.id)

  console.log(`Linked ${toAdd.length} courses, removed ${toRemove.length} for user ${linkUser.id}`)
  return jsonResponse({ success: true, added: toAdd.length, removed: toRemove.length })
}
