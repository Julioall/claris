import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import {
  listCourseCategoriesByMoodleCourseIds,
  listLinkedCourseIds,
  resolveMoodleSourceFromUrl,
  upsertCourses,
  upsertUserCourseLinks,
} from '../_shared/domain/moodle-sync/repository.ts'
import {
  findUserById,
  findUserByMoodleUserId,
  touchUserLastSync,
  updateUserProfile,
} from '../_shared/domain/users/repository.ts'
import { getCategories, getSiteInfo, getUserCourses, resolveCourseCategoryName } from '../_shared/moodle/mod.ts'

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

export async function syncCourses(moodleUrl: string, token: string, userId: string): Promise<Response> {
  const supabase = createServiceClient()

  const dbUser = await findUserByMoodleUserId(supabase, userId)

  if (!dbUser) return errorResponse('User not found in database', 404)

  const numericUserId = parseInt(userId, 10)
  const source = resolveMoodleSourceFromUrl(moodleUrl)

  let siteInfo: Awaited<ReturnType<typeof getSiteInfo>>
  let moodleCourses: Awaited<ReturnType<typeof getUserCourses>>
  let categories: Awaited<ReturnType<typeof getCategories>>

  try {
    ;[siteInfo, moodleCourses, categories] = await Promise.all([
      getSiteInfo(moodleUrl, token),
      getUserCourses(moodleUrl, token, numericUserId),
      getCategories(moodleUrl, token),
    ])
  } catch (fetchError) {
    console.error('[moodle-sync-courses] Failed to fetch data from Moodle:', fetchError)
    return errorResponse('Failed to sync courses', 500)
  }

  // Only update tutor profile when syncing from the primary (goias) source
  if (source === 'goias') {
    try {
      const now = new Date().toISOString()
      const profileEmail = normalizeEmail(siteInfo.email)

      await updateUserProfile(supabase, dbUser.id, {
        moodle_username: siteInfo.username,
        full_name: siteInfo.fullname || `${siteInfo.firstname} ${siteInfo.lastname}`,
        email: profileEmail,
        avatar_url: siteInfo.profileimageurl || null,
        updated_at: now,
      })

      if (profileEmail) {
        const updateAuthUserResult = await supabase.auth.admin.updateUserById(dbUser.id, {
          email: profileEmail,
          email_confirm: true,
          user_metadata: { moodle_user_id: String(siteInfo.userid) },
        })

        if (updateAuthUserResult.error) {
          console.warn('[moodle-sync-courses] Failed to sync auth email:', updateAuthUserResult.error)
        }
      }
    } catch (profileSyncError) {
      console.warn('[moodle-sync-courses] Failed to sync tutor profile metadata:', profileSyncError)
    }
  }

  console.log(`Found ${moodleCourses.length} courses for user ${userId} (source: ${source})`)
  console.log(`Found ${categories.length} categories`)

  const existingCourseCategories = await listCourseCategoriesByMoodleCourseIds(
    supabase,
    moodleCourses.map((course) => String(course.id)),
    source,
  )
  const existingCategoryByMoodleCourseId = new Map(
    existingCourseCategories.map((course) => [course.moodle_course_id, course.category]),
  )

  const now = new Date().toISOString()
  const unresolvedCourseIds: string[] = []

  const coursesData = moodleCourses.map((course) => {
    const moodleCourseId = String(course.id)
    const categoryName = resolveCourseCategoryName(
      course.category,
      categories,
      existingCategoryByMoodleCourseId.get(moodleCourseId) ?? null,
    )

    if (course.category && !categoryName) {
      unresolvedCourseIds.push(moodleCourseId)
    }

    return {
      moodle_source: source,
      moodle_course_id: moodleCourseId,
      name: course.fullname,
      short_name: course.shortname,
      category: categoryName,
      start_date: course.startdate ? new Date(course.startdate * 1000).toISOString() : null,
      end_date: course.enddate ? new Date(course.enddate * 1000).toISOString() : null,
      last_sync: now,
      updated_at: now,
    }
  })

  if (unresolvedCourseIds.length > 0) {
    console.error(
      'Failed to resolve category hierarchy for Moodle courses:',
      unresolvedCourseIds,
    )
    return errorResponse(
      'Failed to resolve Moodle course categories. Retry the sync to avoid overwriting schools and categories with incomplete data.',
      502,
    )
  }

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
