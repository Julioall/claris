export const GRADE_SUGGESTION_JOBS_CONTRACT_VERSION = 1 as const
export const GRADE_SUGGESTION_JOBS_MAX_BODY_BYTES = 4 * 1024

export const GRADE_SUGGESTION_JOB_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
] as const

export type GradeSuggestionJobStatusDto = typeof GRADE_SUGGESTION_JOB_STATUSES[number]

export interface GradeSuggestionJobSummaryDto {
  activityName: string
  courseId: string
  createdAt: string
  errorCount: number
  errorMessage: string | null
  jobId: string
  moodleActivityId: string
  processedItems: number
  status: GradeSuggestionJobStatusDto
  successCount: number
  totalItems: number
}

export interface FindLatestRelevantGradeSuggestionJobDto {
  job: GradeSuggestionJobSummaryDto | null
  metadata: {
    contractVersion: typeof GRADE_SUGGESTION_JOBS_CONTRACT_VERSION
    generatedAt: string
  }
}
