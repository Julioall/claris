export const COURSE_CATALOG_CONTRACT_VERSION = 1 as const
export const COURSE_CATALOG_MAX_BODY_BYTES = 16 * 1024
export const COURSE_CATALOG_MAX_COURSE_IDS = 200

export const COURSE_CATALOG_ACTIONS = [
  'get_catalog',
  'set_association_role',
  'set_ignored',
  'set_attendance_enabled',
] as const

export const COURSE_ASSOCIATION_ROLES = ['tutor', 'viewer'] as const
export const COURSE_LIFECYCLE_STATUSES = [
  'nao_iniciada',
  'em_andamento',
  'finalizada',
] as const

export type CourseCatalogAction = typeof COURSE_CATALOG_ACTIONS[number]
export type CourseAssociationRoleDto = typeof COURSE_ASSOCIATION_ROLES[number]
export type CourseLifecycleStatusDto = typeof COURSE_LIFECYCLE_STATUSES[number]

export interface CourseCatalogItemDto {
  atRiskStudentCount: number
  category: string | null
  createdAt: string | null
  effectiveEndsAt: string | null
  endsAt: string | null
  id: string
  isAttendanceEnabled: boolean
  isFollowing: boolean
  isIgnored: boolean
  lastSynchronizedAt: string | null
  lifecycleStatus: CourseLifecycleStatusDto
  moodleCourseId: string
  name: string
  shortName: string | null
  startsAt: string | null
  studentCount: number
  studentIds: string[]
  updatedAt: string | null
}

export interface CourseCatalogDto {
  items: CourseCatalogItemDto[]
  metadata: {
    contractVersion: typeof COURSE_CATALOG_CONTRACT_VERSION
    generatedAt: string
  }
}

export interface CourseCatalogCommandDto {
  action: Exclude<CourseCatalogAction, 'get_catalog'>
  affectedCourseCount: number
  contractVersion: typeof COURSE_CATALOG_CONTRACT_VERSION
}

export type CourseCatalogResponseDto = CourseCatalogDto | CourseCatalogCommandDto
