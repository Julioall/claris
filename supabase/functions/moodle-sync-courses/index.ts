import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import {
  validateMoodleUrl,
  validateString,
  validatePositiveInteger,
  validateStringArray,
} from '../_shared/validation.ts'
import { getUserCourses, getCategories, buildCategoryPath } from '../_shared/moodle-client.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const body = await req.json()
    const { action, moodleUrl, token, userId, selectedCourseIds } = body

    const supabase = createServiceClient()

    // Support both sync_courses and link_selected_courses actions
    if (action === 'link_selected_courses') {
      return await handleLinkSelectedCourses(supabase, body)
    }

    // Default: sync_courses
    return await handleSyncCourses(supabase, body)
  } catch (error: unknown) {
    console.error('Error in moodle-sync-courses:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', 500)
  }
})

async function handleSyncCourses(supabase: any, body: any): Promise<Response> {
  const { moodleUrl, token, userId } = body
  if (!moodleUrl || !token || !userId) {
    return errorResponse('Missing required fields: moodleUrl, token, userId')
  }

  const { data: dbUser } = await supabase
    .from('users')
    .select('id')
    .eq('moodle_user_id', String(userId))
    .maybeSingle()

  if (!dbUser) return errorResponse('User not found in database', 404)

  const moodleCourses = await getUserCourses(moodleUrl, token, userId)
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

async function handleLinkSelectedCourses(supabase: any, body: any): Promise<Response> {
  const { userId, selectedCourseIds } = body
  if (!userId || !selectedCourseIds || !Array.isArray(selectedCourseIds)) {
    return errorResponse('Missing required fields: userId, selectedCourseIds')
  }

  const { data: linkUser } = await supabase
    .from('users')
    .select('id')
    .eq('moodle_user_id', String(userId))
    .maybeSingle()

  if (!linkUser) return errorResponse('User not found', 404)

  const { data: existingLinks } = await supabase
    .from('user_courses')
    .select('course_id')
    .eq('user_id', linkUser.id)

  const existingCourseIds = new Set<string>(existingLinks?.map((l: any) => l.course_id as string) || [])
  const selectedSet = new Set(selectedCourseIds as string[])

  // Remove unselected
  const toRemove = [...existingCourseIds].filter((id: string) => !selectedSet.has(id))
  if (toRemove.length > 0) {
    await supabase.from('user_courses').delete().eq('user_id', linkUser.id).in('course_id', toRemove)
  }

  // Add newly selected
  const toAdd = (selectedCourseIds as string[]).filter((id) => !existingCourseIds.has(id))
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
