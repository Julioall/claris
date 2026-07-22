import type { Json } from '../_shared/db/mod.ts'

export const BACKGROUND_JOBS_CONTRACT_VERSION = 1 as const

export type BackgroundJobStatusDto = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface BackgroundJobUserDto {
  email: string | null
  fullName: string
  id: string
}

export interface BackgroundJobDto {
  canCancel: boolean
  canRetry: boolean
  completedAt: string | null
  courseId: string | null
  createdAt: string
  description: string | null
  errorCount: number
  errorMessage: string | null
  id: string
  jobType: string
  metadata: Json
  processedItems: number
  source: string
  sourceRecordId: string | null
  sourceTable: string | null
  startedAt: string | null
  status: BackgroundJobStatusDto
  successCount: number
  title: string
  totalItems: number
  updatedAt: string
  user: BackgroundJobUserDto | null
  userId: string
}

export interface BackgroundJobItemDto {
  completedAt: string | null
  createdAt: string
  errorMessage: string | null
  id: string
  itemKey: string | null
  jobId: string
  label: string
  metadata: Json
  progressCurrent: number
  progressTotal: number
  sourceRecordId: string | null
  sourceTable: string | null
  startedAt: string | null
  status: string
  updatedAt: string
  userId: string
}

export interface BackgroundJobEventDto {
  createdAt: string
  eventType: string
  id: string
  jobId: string
  jobItemId: string | null
  level: 'info' | 'warning' | 'error'
  message: string
  metadata: Json
  userId: string
}

export interface ActiveBackgroundJobsDto {
  contractVersion: typeof BACKGROUND_JOBS_CONTRACT_VERSION
  items: BackgroundJobDto[]
}

export interface AdminBackgroundJobsPageDto {
  contractVersion: typeof BACKGROUND_JOBS_CONTRACT_VERSION
  items: BackgroundJobDto[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface AdminBackgroundJobDetailsDto {
  contractVersion: typeof BACKGROUND_JOBS_CONTRACT_VERSION
  events: BackgroundJobEventDto[]
  items: BackgroundJobItemDto[]
  job: BackgroundJobDto
}

export interface BackgroundJobCommandDto {
  contractVersion: typeof BACKGROUND_JOBS_CONTRACT_VERSION
  job: BackgroundJobDto
}

export type BackgroundJobsResponseDto =
  | ActiveBackgroundJobsDto
  | AdminBackgroundJobsPageDto
  | AdminBackgroundJobDetailsDto
  | BackgroundJobCommandDto
