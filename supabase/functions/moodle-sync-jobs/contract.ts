export const MOODLE_SYNC_JOBS_CONTRACT_VERSION = 1 as const

export const MOODLE_SYNC_JOB_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
] as const

export const MOODLE_SYNC_STEP_ENTITIES = [
  'courses',
  'students',
  'activities',
  'grades',
  'risk',
] as const

export type MoodleSyncJobStatusDto = typeof MOODLE_SYNC_JOB_STATUSES[number]
export type MoodleSyncStepEntityDto = typeof MOODLE_SYNC_STEP_ENTITIES[number]
export type MoodleSyncEntityDto = 'students' | 'activities' | 'grades'

export interface MoodleSyncCourseDto {
  category: string | null
  createdAt: string | null
  endsAt: string | null
  id: string
  lastSynchronizedAt: string | null
  moodleCourseId: string
  name: string
  shortName: string | null
  startsAt: string | null
  updatedAt: string | null
}

export interface MoodleSyncJobStepDto {
  entity: MoodleSyncStepEntityDto
  errorMessage: string | null
  processedItems: number
  recordCount: number
  status: MoodleSyncJobStatusDto
  totalItems: number
}

export interface MoodleSyncJobDto {
  completedAt: string | null
  courseIds: string[]
  createdAt: string
  entities: MoodleSyncEntityDto[]
  errorCount: number
  errorMessage: string | null
  id: string
  kind: 'initial' | 'incremental'
  processedItems: number
  startedAt: string | null
  status: MoodleSyncJobStatusDto
  steps: MoodleSyncJobStepDto[]
  successCount: number
  totalItems: number
  updatedAt: string
}

export interface MoodleSyncJobResponseDto {
  contractVersion: typeof MOODLE_SYNC_JOBS_CONTRACT_VERSION
  duplicate: boolean
  job: MoodleSyncJobDto
}

export interface MoodleSyncActiveJobsDto {
  contractVersion: typeof MOODLE_SYNC_JOBS_CONTRACT_VERSION
  items: MoodleSyncJobDto[]
}

export interface MoodleSyncCoursesDto {
  contractVersion: typeof MOODLE_SYNC_JOBS_CONTRACT_VERSION
  items: MoodleSyncCourseDto[]
}

export interface MoodleSyncPreferencesDto {
  contractVersion: typeof MOODLE_SYNC_JOBS_CONTRACT_VERSION
  includeEmptyCourses: boolean
  includeFinished: boolean
  selectedKeys: string[]
}

export interface MoodleSyncCourseCountsDto {
  contractVersion: typeof MOODLE_SYNC_JOBS_CONTRACT_VERSION
  counts: Array<{ courseId: string; studentCount: number }>
}

export interface MoodleRiskRecalculationDto {
  contractVersion: typeof MOODLE_SYNC_JOBS_CONTRACT_VERSION
  failedCount: number
  missingRpc: boolean
  updatedCount: number
  usedFallback: boolean
}

export interface MoodleSyncCommandDto {
  contractVersion: typeof MOODLE_SYNC_JOBS_CONTRACT_VERSION
  job: MoodleSyncJobDto
}

export type MoodleSyncJobsResponseDto =
  | MoodleSyncJobResponseDto
  | MoodleSyncActiveJobsDto
  | MoodleSyncCoursesDto
  | MoodleSyncPreferencesDto
  | MoodleSyncCourseCountsDto
  | MoodleRiskRecalculationDto
  | MoodleSyncCommandDto
