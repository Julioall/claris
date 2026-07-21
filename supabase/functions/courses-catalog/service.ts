import { ApiError } from '../_shared/http/mod.ts'
import {
  COURSE_CATALOG_CONTRACT_VERSION,
  type CourseCatalogCommandDto,
  type CourseCatalogDto,
  type CourseCatalogResponseDto,
} from './contract.ts'
import type {
  CourseCatalogPayload,
  SetCourseAssociationRolePayload,
  SetCourseAttendanceEnabledPayload,
  SetCoursesIgnoredPayload,
} from './payload.ts'
import type { CourseCatalogRepository } from './repository.ts'
import {
  getCourseCatalogLifecycleStatus,
  withEffectiveCourseCatalogDates,
} from './rules.ts'

function databaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

async function executeCourseCommand(operation: () => Promise<number>): Promise<number> {
  try {
    return await operation()
  } catch (error) {
    const code = databaseErrorCode(error)
    if (code === '42501') throw ApiError.forbidden('Course access denied')
    if (code === 'P0002') throw ApiError.notFound('Course not found')
    if (code === '22023') throw ApiError.unprocessable('Invalid course command')
    throw error
  }
}

function commandResult(
  action: CourseCatalogCommandDto['action'],
  affectedCourseCount: number,
): CourseCatalogCommandDto {
  return {
    action,
    affectedCourseCount,
    contractVersion: COURSE_CATALOG_CONTRACT_VERSION,
  }
}

export async function getCourseCatalog(
  repository: CourseCatalogRepository,
  authenticatedUserId: string,
  options: { now?: Date } = {},
): Promise<CourseCatalogDto> {
  const now = options.now ?? new Date()
  const records = withEffectiveCourseCatalogDates(
    await repository.getCatalog(authenticatedUserId),
  )

  return {
    items: records.map((record) => ({
      atRiskStudentCount: record.atRiskStudentCount,
      category: record.category,
      createdAt: record.createdAt,
      effectiveEndsAt: record.effectiveEndsAt,
      endsAt: record.endsAt,
      id: record.id,
      isAttendanceEnabled: record.isAttendanceEnabled,
      isFollowing: record.isFollowing,
      isIgnored: record.isIgnored,
      lastSynchronizedAt: record.lastSynchronizedAt,
      lifecycleStatus: getCourseCatalogLifecycleStatus(record, now),
      moodleCourseId: record.moodleCourseId,
      name: record.name,
      shortName: record.shortName,
      startsAt: record.startsAt,
      studentCount: record.studentCount,
      studentIds: record.studentIds,
      updatedAt: record.updatedAt,
    })),
    metadata: {
      contractVersion: COURSE_CATALOG_CONTRACT_VERSION,
      generatedAt: now.toISOString(),
    },
  }
}

export async function setCourseAssociationRole(
  repository: CourseCatalogRepository,
  authenticatedUserId: string,
  payload: SetCourseAssociationRolePayload,
): Promise<CourseCatalogCommandDto> {
  if (!await repository.hasCourseAssociationScope(authenticatedUserId, payload.courseIds)) {
    throw ApiError.forbidden('Course access denied')
  }

  const affected = await executeCourseCommand(() => repository.setAssociationRole({
    courseIds: payload.courseIds,
    role: payload.role,
    userId: authenticatedUserId,
  }))
  return commandResult(payload.action, affected)
}

export async function setCoursesIgnored(
  repository: CourseCatalogRepository,
  authenticatedUserId: string,
  payload: SetCoursesIgnoredPayload,
): Promise<CourseCatalogCommandDto> {
  const affected = await executeCourseCommand(() => repository.setIgnored({
    courseIds: payload.courseIds,
    ignored: payload.ignored,
    userId: authenticatedUserId,
  }))
  return commandResult(payload.action, affected)
}

export async function setCourseAttendanceEnabled(
  repository: CourseCatalogRepository,
  authenticatedUserId: string,
  payload: SetCourseAttendanceEnabledPayload,
): Promise<CourseCatalogCommandDto> {
  const affected = await executeCourseCommand(() => repository.setAttendanceEnabled({
    courseIds: payload.courseIds,
    enabled: payload.enabled,
    userId: authenticatedUserId,
  }))
  return commandResult(payload.action, affected)
}

export async function executeCourseCatalogAction(
  repository: CourseCatalogRepository,
  authenticatedUserId: string,
  payload: CourseCatalogPayload,
  options: { now?: Date } = {},
): Promise<CourseCatalogResponseDto> {
  if (payload.action === 'get_catalog') {
    return getCourseCatalog(repository, authenticatedUserId, options)
  }
  if (payload.action === 'set_association_role') {
    return setCourseAssociationRole(repository, authenticatedUserId, payload)
  }
  if (payload.action === 'set_ignored') {
    return setCoursesIgnored(repository, authenticatedUserId, payload)
  }
  return setCourseAttendanceEnabled(repository, authenticatedUserId, payload)
}
