import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import {
  listCourseCategoriesByMoodleCourseIds,
  listLinkedCourseIds,
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

const GOIAS_MOODLE_URL = 'https://ead.fieg.com.br'
const NACIONAL_MOODLE_URL = 'https://ead.senai.br'

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '').toLowerCase()
}

function buildUrlCandidates(inputUrl: string): string[] {
  const normalizedInput = normalizeUrl(inputUrl)
  const candidates = [normalizedInput]

  if (normalizedInput === normalizeUrl(GOIAS_MOODLE_URL)) {
    candidates.push(normalizeUrl(NACIONAL_MOODLE_URL))
  } else if (normalizedInput === normalizeUrl(NACIONAL_MOODLE_URL)) {
    candidates.push(normalizeUrl(GOIAS_MOODLE_URL))
  }

  return Array.from(new Set(candidates))
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
  const candidates = buildUrlCandidates(requestedMoodleUrl)
  let firstError: unknown = null

  for (const candidateUrl of candidates) {
    try {
      const [siteInfo, courses, categories] = await Promise.all([
        getSiteInfo(candidateUrl, token),
        getUserCourses(candidateUrl, token, userId),
        getCategories(candidateUrl, token),
      ])

      if (courses.length > 0) {
        if (candidateUrl !== normalizeUrl(requestedMoodleUrl)) {
          console.warn(
            `[moodle-sync-courses] using fallback URL ${candidateUrl} after empty/failed result on ${requestedMoodleUrl}`,
          )
        }

        return { url: candidateUrl, siteInfo, courses, categories }
      }

      if (!firstError) {
        firstError = new Error(`No courses returned for ${candidateUrl}`)
      }
    } catch (error) {
      console.warn(`[moodle-sync-courses] failed candidate URL ${candidateUrl}:`, error)
      if (!firstError) {
        firstError = error
      }
    }
  }

  throw firstError ?? new Error('Unable to fetch Moodle courses from available URLs')
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
    console.error('[moodle-sync-courses] Failed to fetch courses in primary/fallback URLs:', sourceError)
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
