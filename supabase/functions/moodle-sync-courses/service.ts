import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import {
  listCourseCategoriesByMoodleCourseIds,
  listLinkedCourseIds,
  removeUserCourseLinks,
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

const PRIMARY_MOODLE_URL = 'https://ead.fieg.com.br'

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

/**
 * Validates email format using a simple regex.
 * Returns true if email looks valid (has @ and domain).
 */
function isValidEmail(email: string | null): email is string {
  if (!email) return false
  // Simple validation: must have @ and at least one char before/after
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '').toLowerCase()
}

interface MoodleSyncSource {
  url: string
  siteInfo: Awaited<ReturnType<typeof getSiteInfo>>
  courses: Awaited<ReturnType<typeof getUserCourses>>
  categories: Awaited<ReturnType<typeof getCategories>>
}

async function resolveMoodleSyncSource(
  token: string,
  userId: number,
  requestedMoodleUrl: string,
): Promise<MoodleSyncSource> {
  const enforcedUrl = normalizeUrl(PRIMARY_MOODLE_URL)
  const requestedUrl = normalizeUrl(requestedMoodleUrl)

  if (requestedUrl !== enforcedUrl) {
    console.warn(`[moodle-sync-courses] ignoring requested Moodle URL ${requestedUrl}, enforcing ${enforcedUrl}`)
  }

  const [siteInfo, courses, categories] = await Promise.all([
    getSiteInfo(enforcedUrl, token),
    getUserCourses(enforcedUrl, token, userId),
    getCategories(enforcedUrl, token),
  ])

  if (courses.length === 0) {
    throw new Error(`No courses returned for ${enforcedUrl}`)
  }

  return { url: enforcedUrl, siteInfo, courses, categories }
}

export async function syncCourses(moodleUrl: string, token: string, userId: string): Promise<Response> {
  const supabase = createServiceClient()

  const dbUser = await findUserByMoodleUserId(supabase, userId)

  if (!dbUser) return errorResponse('User not found in database', 404)

  const numericUserId = parseInt(userId, 10)

  let moodleSource: MoodleSyncSource
  try {
    moodleSource = await resolveMoodleSyncSource(token, numericUserId, moodleUrl)
  } catch (sourceError) {
    console.error('[moodle-sync-courses] Failed to fetch courses from Moodle:', sourceError)
    return errorResponse('Failed to sync courses', 500)
  }

  try {
    const siteInfo = moodleSource.siteInfo
    const now = new Date().toISOString()
    const profileEmail = normalizeEmail(siteInfo.email)

    await updateUserProfile(supabase, dbUser.id, {
      moodle_username: siteInfo.username,
      full_name: siteInfo.fullname || `${siteInfo.firstname} ${siteInfo.lastname}`,
      email: profileEmail,
      avatar_url: siteInfo.profileimageurl || null,
      updated_at: now,
    })

    if (profileEmail && isValidEmail(profileEmail)) {
      const updateAuthUserResult = await supabase.auth.admin.updateUserById(dbUser.id, {
        email: profileEmail,
        email_confirm: true,
        user_metadata: { moodle_user_id: String(siteInfo.userid) },
      })

      if (updateAuthUserResult.error) {
        console.warn('[moodle-sync-courses] Failed to sync auth email:', updateAuthUserResult.error)
      }
    } else if (profileEmail) {
      console.warn(
        `[moodle-sync-courses] Email from Moodle failed validation: "${profileEmail}". Skipping auth update.`,
      )
    }
  } catch (profileSyncError) {
    console.warn('[moodle-sync-courses] Failed to sync tutor profile metadata:', profileSyncError)
  }

  const moodleCourses = moodleSource.courses
  console.log(`Found ${moodleCourses.length} courses for user ${userId}`)

  const categories = moodleSource.categories
  console.log(`Found ${categories.length} categories`)
  const existingCourseCategories = await listCourseCategoriesByMoodleCourseIds(
    supabase,
    moodleCourses.map((course) => String(course.id)),
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
  const selectedCourseIdSet = new Set<string>(selectedCourseIds)

  // Add newly selected
  const toAdd = selectedCourseIds.filter((id) => !existingCourseIds.has(id))
  if (toAdd.length > 0) {
    const links = toAdd.map((course_id) => ({ user_id: linkUser.id, course_id, role: 'tutor' }))
    const BATCH = 100
    for (let i = 0; i < links.length; i += BATCH) {
      await upsertUserCourseLinks(supabase, links.slice(i, i + BATCH))
    }
  }

  // Remove courses no longer selected so school/catalog views reflect exact selection.
  const toRemove = existingLinks.filter((courseId) => !selectedCourseIdSet.has(courseId))
  if (toRemove.length > 0) {
    const BATCH = 100
    for (let i = 0; i < toRemove.length; i += BATCH) {
      await removeUserCourseLinks(supabase, linkUser.id, toRemove.slice(i, i + BATCH))
    }
  }

  await touchUserLastSync(supabase, linkUser.id, new Date().toISOString())

  console.log(`Updated selected courses for user ${linkUser.id}: added=${toAdd.length}, removed=${toRemove.length}`)
  return jsonResponse({ success: true, added: toAdd.length, removed: toRemove.length })
}
