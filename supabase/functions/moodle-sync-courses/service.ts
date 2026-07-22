import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import {
  linkEligibleUserCourses,
  listCourseCategoriesByMoodleCourseIds,
  listLinkedCourseIds,
  replaceUserCourseEligibility,
  upsertCourses,
} from '../_shared/domain/moodle-sync/repository.ts'
import { computeContentHash } from '../_shared/domain/moodle-sync/content-hash.ts'
import type { MoodleAccess } from '../_shared/domain/moodle-connections/mod.ts'
import {
  findFreshMoodleCategoryCache,
  updateMoodleConnectionDiscovery,
  updateMoodleSiteObservation,
  upsertMoodleCategoryCache,
} from '../_shared/domain/moodle-connections/mod.ts'
import {
  findUserById,
  touchUserLastSync,
} from '../_shared/domain/users/repository.ts'
import {
  getCategories,
  getCourseEnrolledUsers,
  getSiteInfo,
  getUserCourses,
  resolveCourseCategoryName,
} from '../_shared/moodle/mod.ts'
import type { MoodleCategory } from '../_shared/moodle/mod.ts'
import {
  executeEligibleCourseLink,
  upsertCoursesAndReplaceEligibility,
} from './eligibility.ts'

const TUTOR_ROLE_KEYWORDS = ['teacher', 'editingteacher', 'tutor', 'monitor']
const ENROLLED_USERS_POOL_SIZE = 2
const ENROLLED_USERS_BATCH_DELAY_MS = 500

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function loadConnectionCategories(
  supabase: ReturnType<typeof createServiceClient>,
  access: MoodleAccess,
): Promise<MoodleCategory[]> {
  const now = new Date()
  try {
    const cached = await findFreshMoodleCategoryCache(supabase, access.connectionId, now.toISOString())
    if (cached && Array.isArray(cached.categories)) {
      return cached.categories as unknown as MoodleCategory[]
    }
  } catch (error) {
    console.warn('[moodle-sync-courses] Category cache read failed.', {
      connectionId: access.connectionId,
      errorType: error instanceof Error ? error.name : 'unknown',
    })
  }

  const categories = await getCategories(access.moodleUrl, access.token)
  const serialized = JSON.stringify(categories)
  const byteSize = new TextEncoder().encode(serialized).byteLength
  if (byteSize <= 4 * 1024 * 1024) {
    const observedAt = now.toISOString()
    await upsertMoodleCategoryCache(supabase, {
      byteSize,
      categories: JSON.parse(serialized),
      connectionId: access.connectionId,
      contentHash: await sha256(serialized),
      expiresAt: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
      observedAt,
    }).catch((error) => {
      console.warn('[moodle-sync-courses] Category cache write failed.', {
        connectionId: access.connectionId,
        errorType: error instanceof Error ? error.name : 'unknown',
      })
    })
  }
  return categories
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
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

    if (index + ENROLLED_USERS_POOL_SIZE < params.moodleCourseIds.length) {
      await wait(ENROLLED_USERS_BATCH_DELAY_MS)
    }
  }

  return tutorCourseIds
}

export async function syncCourses(
  access: MoodleAccess,
  options: { autoLinkTutorCourses?: boolean } = {},
): Promise<Response> {
  const supabase = createServiceClient()

  const dbUser = await findUserById(supabase, access.userId)

  if (!dbUser) return errorResponse('User not found in database', 404)

  const numericUserId = Number.parseInt(access.moodleUserId, 10)
  if (!Number.isSafeInteger(numericUserId) || numericUserId <= 0) {
    return errorResponse('Moodle connection has an invalid external user id', 409)
  }
  const moodleBaseUrl = access.moodleUrl
  const token = access.token

  let siteInfo: Awaited<ReturnType<typeof getSiteInfo>>
  let moodleCourses: Awaited<ReturnType<typeof getUserCourses>>
  let categories: Awaited<ReturnType<typeof getCategories>>
  try {
    ;[siteInfo, moodleCourses, categories] = await Promise.all([
      getSiteInfo(moodleBaseUrl, token),
      getUserCourses(moodleBaseUrl, token, numericUserId),
      loadConnectionCategories(supabase, access),
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
    const functionNames = (siteInfo.functions ?? [])
      .map((entry) => entry.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0)

    await Promise.all([
      updateMoodleConnectionDiscovery(supabase, {
        capabilities: {
          functions: functionNames,
          observedAt: now,
          release: siteInfo.release ?? null,
          version: siteInfo.version ?? null,
        },
        connectionId: access.connectionId,
        email: profileEmail,
        fullName: siteInfo.fullname || `${siteInfo.firstname} ${siteInfo.lastname}`.trim() || null,
        moodleUserId: String(siteInfo.userid),
        username: siteInfo.username || null,
      }),
      updateMoodleSiteObservation(
        supabase,
        access.moodleSiteId,
        siteInfo.release ?? null,
        siteInfo.version ?? null,
      ),
    ])
  } catch (profileSyncError) {
    console.warn('[moodle-sync-courses] Failed to persist sanitized Moodle discovery metadata.', {
      connectionId: access.connectionId,
      errorType: profileSyncError instanceof Error ? profileSyncError.name : 'unknown',
    })
  }

  console.log('[moodle-sync-courses] Discovery completed.', {
    categoryCount: categories.length,
    connectionId: access.connectionId,
    courseCount: moodleCourses.length,
    siteSlug: access.siteSlug,
  })
  const existingCourseCategories = await listCourseCategoriesByMoodleCourseIds(
    supabase,
    access.moodleSiteId,
    moodleCourses.map((course) => String(course.id)),
  )

  const existingCategoryByMoodleCourseId = new Map(
    existingCourseCategories.map((course) => [course.moodle_course_id, course.category]),
  )

  const now = new Date().toISOString()
  const unresolvedCourseIds: string[] = []

  const coursesData = await Promise.all(moodleCourses.map(async (course) => {
    const moodleCourseId = String(course.id)
    const categoryName = resolveCourseCategoryName(
      course.category,
      categories,
      existingCategoryByMoodleCourseId.get(moodleCourseId) ?? null,
    )

    if (course.category && !categoryName) {
      unresolvedCourseIds.push(moodleCourseId)
    }

    const normalizedCourse = {
      moodle_course_id: moodleCourseId,
      moodle_site_id: access.moodleSiteId,
      name: course.fullname,
      short_name: course.shortname,
      category: categoryName,
      start_date: course.startdate ? new Date(course.startdate * 1000).toISOString() : null,
      end_date: course.enddate ? new Date(course.enddate * 1000).toISOString() : null,
    }

    return {
      ...normalizedCourse,
      content_hash: await computeContentHash(normalizedCourse),
      observed_at: now,
      last_synced_connection_id: access.connectionId,
      last_sync: now,
      updated_at: now,
    }
  }))

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
    const syncedCourses = await upsertCoursesAndReplaceEligibility(
      supabase,
      dbUser.id,
      access.connectionId,
      coursesData,
      {
        replaceUserCourseEligibility,
        upsertCourses,
      },
    )
    const existingLinkedCourseIds = options.autoLinkTutorCourses
      ? new Set(await listLinkedCourseIds(supabase, dbUser.id))
      : new Set<string>()

    const moodleCourseIdsToInspect = options.autoLinkTutorCourses
      ? (syncedCourses || [])
        .filter((course) => !existingLinkedCourseIds.has(course.id))
        .map((course) => Number(course.moodle_course_id))
        .filter((courseId): courseId is number => Number.isFinite(courseId) && courseId > 0)
      : []

    const tutorCourseIds = options.autoLinkTutorCourses
      ? await listCoursesWithTutorRole({
        moodleBaseUrl,
        token,
        moodleUserId: numericUserId,
        moodleCourseIds: moodleCourseIdsToInspect,
      })
      : new Set<string>()

    if (tutorCourseIds.size > 0) {
      const eligibleCourseIds = (syncedCourses || [])
        .filter((course) => tutorCourseIds.has(course.moodle_course_id))
        .map((course) => course.id)

      const LINK_BATCH_SIZE = 500
      for (let i = 0; i < eligibleCourseIds.length; i += LINK_BATCH_SIZE) {
        await linkEligibleUserCourses(
          supabase,
          dbUser.id,
          access.connectionId,
          eligibleCourseIds.slice(i, i + LINK_BATCH_SIZE),
        )
      }

      console.log(`[moodle-sync-courses] Auto-linked ${eligibleCourseIds.length} tutor course(s) for user ${dbUser.id}`)
    } else if (!options.autoLinkTutorCourses) {
      console.log(
        `[moodle-sync-courses] Tutor role auto-link skipped for user ${dbUser.id}. Selected courses are linked explicitly.`,
      )
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

    return jsonResponse({
      success: true,
      contractVersion: 2,
      connectionId: access.connectionId,
      siteSlug: access.siteSlug,
      courses: syncedCourses || [],
    })
  } catch (upsertError) {
    console.error('Error upserting courses:', upsertError)
    return errorResponse('Failed to sync courses', 500)
  }
}

export async function linkSelectedCourses(
  userId: string,
  connectionId: string,
  selectedCourseIds: string[],
): Promise<Response> {
  return executeEligibleCourseLink(
    createServiceClient(),
    userId,
    connectionId,
    selectedCourseIds,
    {
      findUserById,
      linkEligibleUserCourses,
      now: () => new Date(),
      touchUserLastSync,
    },
  )
}
