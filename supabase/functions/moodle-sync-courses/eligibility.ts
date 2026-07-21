import type {
  AppSupabaseClient,
  Tables,
} from '../_shared/db/mod.ts'
import type { CourseInsert } from '../_shared/domain/moodle-sync/repository.ts'
import { errorResponse, jsonResponse } from '../_shared/http/mod.ts'

export interface CourseEligibilityPersistenceDependencies {
  replaceUserCourseEligibility(
    supabase: AppSupabaseClient,
    userId: string,
    courseIds: string[],
  ): Promise<number>
  upsertCourses(
    supabase: AppSupabaseClient,
    payload: CourseInsert[],
  ): Promise<Tables<'courses'>[]>
}

export async function upsertCoursesAndReplaceEligibility(
  supabase: AppSupabaseClient,
  userId: string,
  payload: CourseInsert[],
  dependencies: CourseEligibilityPersistenceDependencies,
): Promise<Tables<'courses'>[]> {
  const syncedCourses = await dependencies.upsertCourses(supabase, payload)
  await dependencies.replaceUserCourseEligibility(
    supabase,
    userId,
    syncedCourses.map((course) => course.id),
  )
  return syncedCourses
}

export interface LinkSelectedCoursesDependencies {
  findUserById(
    supabase: AppSupabaseClient,
    userId: string,
  ): Promise<{ id: string } | null>
  linkEligibleUserCourses(
    supabase: AppSupabaseClient,
    userId: string,
    courseIds: string[],
  ): Promise<number>
  now(): Date
  touchUserLastSync(
    supabase: AppSupabaseClient,
    userId: string,
    timestamp: string,
  ): Promise<void>
}

function databaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function courseLinkErrorResponse(error: unknown): Response | null {
  const code = databaseErrorCode(error)
  if (code === '42501') {
    return errorResponse('Course selection is outside Moodle eligibility', 403)
  }
  if (code === '22023') {
    return errorResponse('Invalid course selection', 422)
  }
  if (code === 'P0002' || code === '23503') {
    return errorResponse('Course not found', 404)
  }
  return null
}

export async function executeEligibleCourseLink(
  supabase: AppSupabaseClient,
  userId: string,
  selectedCourseIds: string[],
  dependencies: LinkSelectedCoursesDependencies,
): Promise<Response> {
  const linkUser = await dependencies.findUserById(supabase, userId)
  if (!linkUser) return errorResponse('User not found', 404)

  let linkedCourseCount: number
  try {
    linkedCourseCount = await dependencies.linkEligibleUserCourses(
      supabase,
      linkUser.id,
      selectedCourseIds,
    )
  } catch (error) {
    const mappedResponse = courseLinkErrorResponse(error)
    if (mappedResponse) return mappedResponse
    throw error
  }

  await dependencies.touchUserLastSync(
    supabase,
    linkUser.id,
    dependencies.now().toISOString(),
  )

  console.log(`Linked ${linkedCourseCount} courses for user ${linkUser.id}`)
  return jsonResponse({ success: true, added: linkedCourseCount, removed: 0 })
}
