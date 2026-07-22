import { userHasCourseAccess } from '../../auth/mod.ts'
import type { AppSupabaseClient } from '../../db/mod.ts'
import { ApiError } from '../../http/mod.ts'
import { findMoodleSiteById, findOwnedMoodleConnection } from './repository.ts'

export interface MoodleConnectionScope {
  connectionId: string
  moodleSiteId: string
  userId: string
}

export async function resolveOwnedMoodleConnectionScope(
  db: AppSupabaseClient,
  userId: string,
  connectionId: string,
): Promise<MoodleConnectionScope> {
  const connection = await findOwnedMoodleConnection(db, userId, connectionId)
  if (!connection || connection.status !== 'active') {
    throw ApiError.forbidden('Moodle connection is not available to this user.')
  }
  const site = await findMoodleSiteById(db, connection.moodle_site_id)
  if (!site || site.status !== 'approved') {
    throw ApiError.forbidden('Moodle site is not approved.')
  }
  return { connectionId: connection.id, moodleSiteId: site.id, userId }
}

export async function assertMoodleCourseConnectionScope(
  db: AppSupabaseClient,
  userId: string,
  connectionId: string,
  courseId: string,
): Promise<MoodleConnectionScope> {
  const [scope, hasCourseAccess] = await Promise.all([
    resolveOwnedMoodleConnectionScope(db, userId, connectionId),
    userHasCourseAccess(db, userId, courseId),
  ])
  if (!hasCourseAccess) throw ApiError.forbidden('Course is not available to this user.')

  const { data, error } = await db
    .from('courses')
    .select('moodle_site_id')
    .eq('id', courseId)
    .maybeSingle()
  if (error) throw error
  if (!data || data.moodle_site_id !== scope.moodleSiteId) {
    throw ApiError.conflict('Course belongs to another Moodle site.')
  }
  return scope
}
