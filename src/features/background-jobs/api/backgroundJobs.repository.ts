import { listActiveBackgroundJobDtos } from './background-jobs.client';

export type BackgroundJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface BackgroundJobListItem {
  id: string;
  user_id: string;
  course_id: string | null;
  job_type: string;
  source: string;
  source_table: string | null;
  source_record_id: string | null;
  title: string;
  description: string | null;
  status: BackgroundJobStatus;
  total_items: number;
  processed_items: number;
  success_count: number;
  error_count: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

export async function listActiveBackgroundJobsForUser(): Promise<BackgroundJobListItem[]> {
  return (await listActiveBackgroundJobDtos()).map((job) => ({
    id: job.id,
    user_id: job.userId,
    course_id: job.courseId,
    job_type: job.jobType,
    source: job.source,
    source_table: job.sourceTable,
    source_record_id: job.sourceRecordId,
    title: job.title,
    description: job.description,
    status: job.status,
    total_items: job.totalItems,
    processed_items: job.processedItems,
    success_count: job.successCount,
    error_count: job.errorCount,
    error_message: job.errorMessage,
    started_at: job.startedAt,
    completed_at: job.completedAt,
    metadata: job.metadata,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  }));
}
