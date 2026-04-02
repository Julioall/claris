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
import { isApplicationAdmin } from '../_shared/auth/mod.ts'
import {
  appendBackgroundJobEvent,
  upsertBackgroundJob,
  updateBackgroundJob,
} from '../_shared/domain/background-jobs/repository.ts'
import {
  getAllCourses,
  getCategories,
  getCourseEnrolledUsers,
  getSiteInfo,
  getUserCourses,
  resolveCourseCategoryName,
} from '../_shared/moodle/mod.ts'
import type { MoodleCategory } from '../_shared/moodle/types.ts'

const PRIMARY_MOODLE_URL = 'https://ead.fieg.com.br'
const TUTOR_ROLE_KEYWORDS = ['teacher', 'editingteacher', 'tutor']
const MONITOR_ROLE_KEYWORDS = ['monitor']
const ENROLLED_USERS_POOL_SIZE = 4

function queueBackgroundTask(task: Promise<unknown>): void {
  const runtime = globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void }
  }
  if (runtime.EdgeRuntime?.waitUntil) {
    runtime.EdgeRuntime.waitUntil(task)
    return
  }
  void task
}
const MONITORED_GROUP_SLUGS = ['tutor', 'monitor'] as const

type UserCourseRole = 'tutor' | 'monitor'

interface ParticipantSyncAccumulator {
  moodleUserId: string
  moodleUsername: string
  fullName: string
  email: string | null
  avatarUrl: string | null
  strongestRole: UserCourseRole
  courseRoles: Map<string, UserCourseRole>
}

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

function roleMatchesMonitorProfile(roleValue: string): boolean {
  return MONITOR_ROLE_KEYWORDS.some((keyword) => roleValue.includes(keyword))
}

function chooseHighestRole(currentRole: UserCourseRole, nextRole: UserCourseRole): UserCourseRole {
  if (currentRole === 'tutor' || nextRole === 'tutor') return 'tutor'
  return 'monitor'
}

function resolveEnrolledUserRole(
  enrolledUser: Awaited<ReturnType<typeof getCourseEnrolledUsers>>[number],
): UserCourseRole | null {
  const roleValues = (enrolledUser.roles ?? [])
    .flatMap((role) => [role.shortname, role.name])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(normalizeRoleValue)

  if (roleValues.length === 0) return null
  if (roleValues.some((value) => roleMatchesTutorProfile(value))) return 'tutor'
  if (roleValues.some((value) => roleMatchesMonitorProfile(value))) return 'monitor'
  return null
}

function normalizeMoodleUsername(
  enrolledUser: Awaited<ReturnType<typeof getCourseEnrolledUsers>>[number],
): string {
  const username = typeof enrolledUser.username === 'string' ? enrolledUser.username.trim() : ''
  if (username.length > 0) return username
  return `moodle_${enrolledUser.id}`
}

function normalizeFullName(
  enrolledUser: Awaited<ReturnType<typeof getCourseEnrolledUsers>>[number],
): string {
  const fullName = typeof enrolledUser.fullname === 'string' ? enrolledUser.fullname.trim() : ''
  if (fullName.length > 0) return fullName

  const first = typeof enrolledUser.firstname === 'string' ? enrolledUser.firstname.trim() : ''
  const last = typeof enrolledUser.lastname === 'string' ? enrolledUser.lastname.trim() : ''
  const joined = `${first} ${last}`.trim()
  return joined.length > 0 ? joined : `Usuario Moodle ${enrolledUser.id}`
}

async function listGroupIdsBySlug(
  supabase: ReturnType<typeof createServiceClient>,
  slugs: readonly string[],
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('app_groups')
    .select('id, slug')
    .in('slug', [...slugs])

  if (error) throw error

  return new Map((data ?? []).map((group: { id: string; slug: string }) => [group.slug, group.id]))
}

async function upsertUsersByMoodleUserId(
  supabase: ReturnType<typeof createServiceClient>,
  participants: ParticipantSyncAccumulator[],
  timestamp: string,
): Promise<Map<string, string>> {
  if (participants.length === 0) return new Map()

  const payload = participants.map((participant) => ({
    moodle_user_id: participant.moodleUserId,
    moodle_username: participant.moodleUsername,
    full_name: participant.fullName,
    email: participant.email,
    avatar_url: participant.avatarUrl,
    updated_at: timestamp,
  }))

  const { data, error } = await supabase
    .from('users')
    .upsert(payload, { onConflict: 'moodle_user_id', ignoreDuplicates: false })
    .select('id, moodle_user_id')

  if (error) throw error

  return new Map((data ?? []).map((row: { id: string; moodle_user_id: string }) => [row.moodle_user_id, row.id]))
}

async function upsertUserCourseLinksWithRoleUpdate(
  supabase: ReturnType<typeof createServiceClient>,
  payload: Array<{ user_id: string; course_id: string; role: UserCourseRole }>,
): Promise<void> {
  if (payload.length === 0) return

  const { error } = await supabase
    .from('user_courses')
    .upsert(payload, { onConflict: 'user_id,course_id', ignoreDuplicates: false })

  if (error) throw error
}

async function upsertTutorMonitorMemberships(params: {
  supabase: ReturnType<typeof createServiceClient>
  desiredGroupByUserId: Map<string, string>
  assignedBy: string
}): Promise<void> {
  const userIds = [...params.desiredGroupByUserId.keys()]
  if (userIds.length === 0) return

  const { data, error } = await params.supabase
    .from('user_group_memberships')
    .select('user_id, group_id, app_groups!inner(slug)')
    .in('user_id', userIds)

  if (error) throw error

  const existingByUserId = new Map<string, { groupId: string; slug: string }>()
  for (const row of (data ?? []) as Array<{ user_id: string; group_id: string; app_groups: { slug: string } }>) {
    existingByUserId.set(row.user_id, { groupId: row.group_id, slug: row.app_groups.slug })
  }

  const upserts: Array<{ user_id: string; group_id: string; assigned_by: string }> = []

  for (const [userId, desiredGroupId] of params.desiredGroupByUserId.entries()) {
    const existing = existingByUserId.get(userId)

    if (!existing) {
      upserts.push({ user_id: userId, group_id: desiredGroupId, assigned_by: params.assignedBy })
      continue
    }

    if (!MONITORED_GROUP_SLUGS.includes(existing.slug as (typeof MONITORED_GROUP_SLUGS)[number])) {
      continue
    }

    if (existing.groupId !== desiredGroupId) {
      upserts.push({ user_id: userId, group_id: desiredGroupId, assigned_by: params.assignedBy })
    }
  }

  if (upserts.length === 0) return

  const { error: upsertError } = await params.supabase
    .from('user_group_memberships')
    .upsert(upserts, { onConflict: 'user_id', ignoreDuplicates: false })

  if (upsertError) throw upsertError
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

export async function listMoodleCategories(token: string): Promise<Response> {
  const moodleBaseUrl = normalizeUrl(PRIMARY_MOODLE_URL)
  try {
    const categories = await getCategories(moodleBaseUrl, token)
    return jsonResponse({ categories })
  } catch (err) {
    console.error('[moodle-sync-courses] Failed to list categories:', err)
    return errorResponse('Failed to fetch Moodle categories', 500)
  }
}

function getAllDescendantIds(selectedIds: number[], allCategories: MoodleCategory[]): Set<number> {
  const result = new Set<number>(selectedIds)
  let changed = true
  while (changed) {
    changed = false
    for (const cat of allCategories) {
      if (!result.has(cat.id) && result.has(cat.parent)) {
        result.add(cat.id)
        changed = true
      }
    }
  }
  return result
}

async function runCatalogSyncInBackground(params: {
  supabase: ReturnType<typeof createServiceClient>
  jobId: string
  token: string
  requesterUserId: string
  requesterDbId: string
  categoryIds?: number[]
}): Promise<void> {
  const { supabase, jobId, token, requesterDbId, categoryIds } = params
  const moodleBaseUrl = normalizeUrl(PRIMARY_MOODLE_URL)
  const startedAt = new Date().toISOString()

  const markFailed = async (errorMessage: string) => {
    await updateBackgroundJob(supabase, jobId, {
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    await appendBackgroundJobEvent(supabase, {
      userId: params.requesterUserId,
      jobId,
      eventType: 'job_failed',
      level: 'error',
      message: errorMessage,
    })
  }

  let moodleCourses: Awaited<ReturnType<typeof getAllCourses>>
  let categories: Awaited<ReturnType<typeof getCategories>>
  try {
    ;[moodleCourses, categories] = await Promise.all([
      getAllCourses(moodleBaseUrl, token),
      getCategories(moodleBaseUrl, token),
    ])
  } catch (sourceError) {
    const msg = sourceError instanceof Error ? sourceError.message : 'Falha ao buscar cursos do Moodle'
    console.error('[moodle-sync-courses] Failed to fetch project catalog from Moodle:', sourceError)
    await markFailed(msg)
    return
  }

  if (moodleCourses.length === 0) {
    await markFailed('Nenhum curso retornado pelo Moodle para a sincronizacao global.')
    return
  }

  const effectiveCategoryIds = Array.isArray(categoryIds) && categoryIds.length > 0
    ? getAllDescendantIds(categoryIds, categories)
    : null

  const scopedMoodleCourses = effectiveCategoryIds
    ? moodleCourses.filter((course) => effectiveCategoryIds.has(Number(course.category)))
    : moodleCourses

  if (scopedMoodleCourses.length === 0) {
    await markFailed('Nenhum curso Moodle encontrado para as categorias selecionadas.')
    return
  }

  const moodleCourseIds = scopedMoodleCourses.map((course) => String(course.id))
  const existingCourseCategories = await listCourseCategoriesByMoodleCourseIds(supabase, moodleCourseIds)
  const existingCategoryByMoodleCourseId = new Map(
    existingCourseCategories.map((course) => [course.moodle_course_id, course.category]),
  )

  const now = new Date().toISOString()
  const unresolvedCourseIds: string[] = []
  const coursesData = scopedMoodleCourses.map((course) => {
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
      '[moodle-sync-courses] Failed to resolve category hierarchy for project sync Moodle courses:',
      unresolvedCourseIds,
    )
    await markFailed(
      'Falha ao resolver hierarquia de categorias Moodle. Tente novamente para evitar dados incompletos de escola/categoria.',
    )
    return
  }

  try {
    const syncedCourses = await upsertCourses(supabase, coursesData)

    const courseByMoodleCourseId = new Map(syncedCourses.map((course) => [course.moodle_course_id, course]))
    const participantsByMoodleUserId = new Map<string, ParticipantSyncAccumulator>()

    const numericCourseIds = syncedCourses
      .map((course) => Number(course.moodle_course_id))
      .filter((courseId): courseId is number => Number.isFinite(courseId) && courseId > 0)

    for (let index = 0; index < numericCourseIds.length; index += ENROLLED_USERS_POOL_SIZE) {
      const batch = numericCourseIds.slice(index, index + ENROLLED_USERS_POOL_SIZE)
      const settled = await Promise.allSettled(
        batch.map(async (courseId) => {
          const enrolledUsers = await getCourseEnrolledUsers(moodleBaseUrl, token, courseId)
          const course = courseByMoodleCourseId.get(String(courseId))
          if (!course) return

          for (const enrolledUser of enrolledUsers) {
            const role = resolveEnrolledUserRole(enrolledUser)
            if (!role) continue

            const moodleUserId = String(enrolledUser.id)
            const existing = participantsByMoodleUserId.get(moodleUserId)

            const nextEmail = normalizeEmail(enrolledUser.email ?? null)
            if (!existing) {
              participantsByMoodleUserId.set(moodleUserId, {
                moodleUserId,
                moodleUsername: normalizeMoodleUsername(enrolledUser),
                fullName: normalizeFullName(enrolledUser),
                email: nextEmail,
                avatarUrl: enrolledUser.profileimageurl ?? null,
                strongestRole: role,
                courseRoles: new Map([[course.id, role]]),
              })
              continue
            }

            const previousCourseRole = existing.courseRoles.get(course.id)
            if (previousCourseRole) {
              existing.courseRoles.set(course.id, chooseHighestRole(previousCourseRole, role))
            } else {
              existing.courseRoles.set(course.id, role)
            }

            existing.strongestRole = chooseHighestRole(existing.strongestRole, role)

            if (!existing.email && nextEmail) {
              existing.email = nextEmail
            }
          }
        }),
      )

      for (const result of settled) {
        if (result.status === 'rejected') {
          console.warn('[moodle-sync-courses] Failed to fetch enrolled users for one course in project sync:', result.reason)
        }
      }
    }

    const participants = [...participantsByMoodleUserId.values()]

    let userCourseLinksCount = 0
    let groupAssignmentsCount = 0

    if (participants.length > 0) {
      const moodleToUserId = await upsertUsersByMoodleUserId(supabase, participants, now)

      const links: Array<{ user_id: string; course_id: string; role: UserCourseRole }> = []
      const desiredRoleByUserId = new Map<string, UserCourseRole>()
      for (const participant of participants) {
        const userId = moodleToUserId.get(participant.moodleUserId)
        if (!userId) continue

        for (const [courseId, role] of participant.courseRoles.entries()) {
          links.push({ user_id: userId, course_id: courseId, role })
        }

        const previousRole = desiredRoleByUserId.get(userId)
        desiredRoleByUserId.set(userId, previousRole ? chooseHighestRole(previousRole, participant.strongestRole) : participant.strongestRole)
      }

      const LINK_BATCH_SIZE = 200
      for (let i = 0; i < links.length; i += LINK_BATCH_SIZE) {
        await upsertUserCourseLinksWithRoleUpdate(supabase, links.slice(i, i + LINK_BATCH_SIZE))
      }

      const groupIdsBySlug = await listGroupIdsBySlug(supabase, MONITORED_GROUP_SLUGS)
      const desiredGroupByUserId = new Map<string, string>()
      for (const [userId, role] of desiredRoleByUserId.entries()) {
        const slug = role === 'monitor' ? 'monitor' : 'tutor'
        const groupId = groupIdsBySlug.get(slug)
        if (groupId) {
          desiredGroupByUserId.set(userId, groupId)
        }
      }

      await upsertTutorMonitorMemberships({
        supabase,
        desiredGroupByUserId,
        assignedBy: requesterDbId,
      })

      userCourseLinksCount = links.length
      groupAssignmentsCount = desiredGroupByUserId.size
    }

    const completedAt = new Date().toISOString()
    await updateBackgroundJob(supabase, jobId, {
      status: 'completed',
      completed_at: completedAt,
      success_count: syncedCourses.length,
      processed_items: syncedCourses.length,
      total_items: syncedCourses.length,
      metadata: {
        courses: syncedCourses.length,
        participantUsers: participants.length,
        userCourseLinks: userCourseLinksCount,
        groupAssignments: groupAssignmentsCount,
        started_at: startedAt,
        completed_at: completedAt,
      },
    })
    await appendBackgroundJobEvent(supabase, {
      userId: params.requesterUserId,
      jobId,
      eventType: 'job_completed',
      message: `Sincronizacao concluida: ${syncedCourses.length} cursos, ${participants.length} usuarios, ${userCourseLinksCount} vinculos, ${groupAssignmentsCount} grupos.`,
    })
  } catch (syncError) {
    console.error('[moodle-sync-courses] Error during project catalog sync:', syncError)
    const errorMessage = syncError instanceof Error ? syncError.message : 'Erro desconhecido durante a sincronizacao global'
    await markFailed(errorMessage)
  }
}

export async function syncProjectCatalog(
  _moodleUrl: string,
  token: string,
  requesterUserId: string,
  categoryIds?: number[],
): Promise<Response> {
  const supabase = createServiceClient()

  const requesterIsAdmin = await isApplicationAdmin(supabase, requesterUserId)
  if (!requesterIsAdmin) {
    return errorResponse('Only application admins can run project-wide Moodle sync.', 403)
  }

  const requester = await findUserById(supabase, requesterUserId)
  if (!requester) {
    return errorResponse('Requester user not found', 404)
  }

  const jobId = crypto.randomUUID()
  const now = new Date().toISOString()

  await upsertBackgroundJob(supabase, {
    id: jobId,
    userId: requesterUserId,
    jobType: 'moodle_catalog_sync',
    source: 'admin',
    title: 'Sincronizacao global do catalogo Moodle',
    description: 'Cursos, participantes e vinculos sendo sincronizados em segundo plano.',
    status: 'processing',
    startedAt: now,
    metadata: {
      category_ids: categoryIds ?? null,
    },
  })

  await appendBackgroundJobEvent(supabase, {
    userId: requesterUserId,
    jobId,
    eventType: 'job_started',
    message: 'Sincronizacao global iniciada em segundo plano.',
  })

  queueBackgroundTask(
    runCatalogSyncInBackground({
      supabase,
      jobId,
      token,
      requesterUserId,
      requesterDbId: requester.id,
      categoryIds,
    }),
  )

  return jsonResponse({ jobId, status: 'processing' })
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
