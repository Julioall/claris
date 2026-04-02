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
import {
  getCategories,
  getCourseEnrolledUsers,
  getSiteInfo,
  getUserCourses,
  resolveCourseCategoryName,
} from '../_shared/moodle/mod.ts'

const PRIMARY_MOODLE_URL = 'https://ead.fieg.com.br'
const TUTOR_ROLE_KEYWORDS = ['teacher', 'editingteacher', 'tutor', 'monitor']
const ENROLLED_USERS_POOL_SIZE = 6

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

function normalizeRoleValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function roleMatchesTutorProfile(roleValue: string): boolean {
  return TUTOR_ROLE_KEYWORDS.some((keyword) => roleValue.includes(keyword))
}

function userHasTutorRoleInCourse(
  enrolledUsers: Awaited<ReturnType<typeof getCourseEnrolledUsers>>,
  moodleUserId: number,
): boolean {
  const currentUser = enrolledUsers.find((user) => Number(user.id) === moodleUserId)
  if (!currentUser) return false

  const roleValues = (currentUser.roles ?? [])
    .flatMap((role) => [role.shortname, role.name])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(normalizeRoleValue)

  if (roleValues.length === 0) return false

  return roleValues.some((value) => roleMatchesTutorProfile(value))
}

async function listCoursesWithTutorRole(params: {
  moodleBaseUrl: string
  token: string
  moodleUserId: number
  moodleCourseIds: number[]
}): Promise<Set<string>> {
  const tutorCourseIds = new Set<string>()
  if (params.moodleCourseIds.length === 0) return tutorCourseIds

  for (let index = 0; index < params.moodleCourseIds.length; index += ENROLLED_USERS_POOL_SIZE) {
    const batch = params.moodleCourseIds.slice(index, index + ENROLLED_USERS_POOL_SIZE)

    const settled = await Promise.allSettled(
      batch.map(async (courseId) => {
        const enrolledUsers = await getCourseEnrolledUsers(params.moodleBaseUrl, params.token, courseId)
        if (userHasTutorRoleInCourse(enrolledUsers, params.moodleUserId)) {
          tutorCourseIds.add(String(courseId))
        }
      }),
    )

    for (const result of settled) {
      if (result.status === 'rejected') {
        console.warn('[moodle-sync-courses] Could not resolve tutor role for one course:', result.reason)
      }
    }
  }

  return tutorCourseIds
}

export async function syncCourses(_moodleUrl: string, token: string, userId: string): Promise<Response> {
  const supabase = createServiceClient()

  const dbUser = await findUserByMoodleUserId(supabase, userId)

  if (!dbUser) return errorResponse('User not found in database', 404)

  const numericUserId = parseInt(userId, 10)
  const moodleBaseUrl = normalizeUrl(PRIMARY_MOODLE_URL)

  let siteInfo: Awaited<ReturnType<typeof getSiteInfo>>
  let moodleCourses: Awaited<ReturnType<typeof getUserCourses>>
  let categories: Awaited<ReturnType<typeof getCategories>>
  try {
    ;[siteInfo, moodleCourses, categories] = await Promise.all([
      getSiteInfo(moodleBaseUrl, token),
      getUserCourses(moodleBaseUrl, token, numericUserId),
      getCategories(moodleBaseUrl, token),
    ])
    if (moodleCourses.length === 0) {
      throw new Error(`No courses returned for ${moodleBaseUrl}`)
    }
  } catch (sourceError) {
    console.error('[moodle-sync-courses] Failed to fetch courses from Moodle:', sourceError)
    return errorResponse('Failed to sync courses', 500)
  }

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

  console.log(`Found ${moodleCourses.length} courses for user ${userId}`)
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
  const moodleCourseIds = moodleCourses
    .map((course) => Number(course.id))
    .filter((courseId): courseId is number => Number.isFinite(courseId) && courseId > 0)

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
    const existingLinkedCourseIds = new Set(await listLinkedCourseIds(supabase, dbUser.id))

    const moodleCourseIdsToInspect = (syncedCourses || [])
      .filter((course) => !existingLinkedCourseIds.has(course.id))
      .map((course) => Number(course.moodle_course_id))
      .filter((courseId): courseId is number => Number.isFinite(courseId) && courseId > 0)

    const tutorCourseIds = await listCoursesWithTutorRole({
      moodleBaseUrl,
      token,
      moodleUserId: numericUserId,
      moodleCourseIds: moodleCourseIdsToInspect,
    })

    if (tutorCourseIds.size > 0) {
      const links = (syncedCourses || [])
        .filter((course) => tutorCourseIds.has(course.moodle_course_id))
        .map((course) => ({
          user_id: dbUser.id,
          course_id: course.id,
          role: 'tutor',
        }))

      const LINK_BATCH_SIZE = 100
      for (let i = 0; i < links.length; i += LINK_BATCH_SIZE) {
        await upsertUserCourseLinks(supabase, links.slice(i, i + LINK_BATCH_SIZE))
      }

      console.log(`[moodle-sync-courses] Auto-linked ${links.length} tutor course(s) for user ${dbUser.id}`)
    } else if (moodleCourseIdsToInspect.length === 0) {
      console.log(
        `[moodle-sync-courses] No new courses to inspect for auto-linking for user ${dbUser.id}. Existing links kept.`,
      )
    } else {
      console.warn(
        `[moodle-sync-courses] No tutor/teacher/monitor role found in fetched courses for moodle_user_id=${numericUserId}. Manual linking remains available.`,
      )
    }

    await touchUserLastSync(supabase, dbUser.id, now)

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
