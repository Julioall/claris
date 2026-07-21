import type { ActivityGradeSuggestionJobStatus } from '../../types';

export const GRADE_SUGGESTION_JOBS_CONTRACT_VERSION = 1 as const;

export const GRADE_SUGGESTION_JOB_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
] as const satisfies readonly ActivityGradeSuggestionJobStatus[];

export interface GradeSuggestionJobSummaryDto {
  activityName: string;
  courseId: string;
  createdAt: string;
  errorCount: number;
  errorMessage: string | null;
  jobId: string;
  moodleActivityId: string;
  processedItems: number;
  status: ActivityGradeSuggestionJobStatus;
  successCount: number;
  totalItems: number;
}

export interface FindLatestRelevantGradeSuggestionJobDto {
  job: GradeSuggestionJobSummaryDto | null;
  metadata: {
    contractVersion: typeof GRADE_SUGGESTION_JOBS_CONTRACT_VERSION;
    generatedAt: string;
  };
}
