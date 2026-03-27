import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

const BACKGROUND_JOBS_TABLE = 'background_jobs' as never;
const BACKGROUND_JOB_ITEMS_TABLE = 'background_job_items' as never;
const BACKGROUND_JOB_EVENTS_TABLE = 'background_job_events' as never;

export type BackgroundJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type BackgroundJobItemStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

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
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface BackgroundJobItem {
  id: string;
  job_id: string;
  user_id: string;
  source_table: string | null;
  source_record_id: string | null;
  item_key: string | null;
  label: string;
  status: BackgroundJobItemStatus;
  progress_current: number;
  progress_total: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface BackgroundJobEvent {
  id: string;
  job_id: string;
  user_id: string;
  job_item_id: string | null;
  event_type: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  metadata: Json;
  created_at: string;
}

export interface CreateBackgroundJobInput {
  userId: string;
  courseId?: string | null;
  jobType: string;
  source: string;
  sourceTable?: string | null;
  sourceRecordId?: string | null;
  title: string;
  description?: string | null;
  status?: BackgroundJobStatus;
  totalItems?: number;
  processedItems?: number;
  successCount?: number;
  errorCount?: number;
  startedAt?: string | null;
  completedAt?: string | null;
  errorMessage?: string | null;
  metadata?: Json;
}

export interface CreateBackgroundJobItemInput {
  id?: string;
  jobId: string;
  userId: string;
  sourceTable?: string | null;
  sourceRecordId?: string | null;
  itemKey?: string | null;
  label: string;
  status?: BackgroundJobItemStatus;
  progressCurrent?: number;
  progressTotal?: number;
  startedAt?: string | null;
  completedAt?: string | null;
  errorMessage?: string | null;
  metadata?: Json;
}

export interface BackgroundJobUpdateInput {
  course_id?: string | null;
  description?: string | null;
  error_count?: number;
  error_message?: string | null;
  metadata?: Json;
  processed_items?: number;
  started_at?: string | null;
  completed_at?: string | null;
  status?: BackgroundJobStatus;
  success_count?: number;
  title?: string;
  total_items?: number;
}

export interface BackgroundJobItemUpdateInput {
  completed_at?: string | null;
  error_message?: string | null;
  metadata?: Json;
  progress_current?: number;
  progress_total?: number;
  started_at?: string | null;
  status?: BackgroundJobItemStatus;
}

export interface BackgroundJobEventInput {
  userId: string;
  jobId: string;
  jobItemId?: string | null;
  eventType: string;
  level?: 'info' | 'warning' | 'error';
  message: string;
  metadata?: Json;
}

export async function listActiveBackgroundJobsForUser(userId: string): Promise<BackgroundJobListItem[]> {
  const { data, error } = await supabase
    .from(BACKGROUND_JOBS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []) as BackgroundJobListItem[];
}

export async function createBackgroundJob(input: CreateBackgroundJobInput): Promise<BackgroundJobListItem> {
  const payload = {
    user_id: input.userId,
    course_id: input.courseId ?? null,
    job_type: input.jobType,
    source: input.source,
    source_table: input.sourceTable ?? null,
    source_record_id: input.sourceRecordId ?? null,
    title: input.title,
    description: input.description ?? null,
    status: input.status ?? 'pending',
    total_items: input.totalItems ?? 0,
    processed_items: input.processedItems ?? 0,
    success_count: input.successCount ?? 0,
    error_count: input.errorCount ?? 0,
    started_at: input.startedAt ?? null,
    completed_at: input.completedAt ?? null,
    error_message: input.errorMessage ?? null,
    metadata: input.metadata ?? {},
  };

  const { data, error } = await supabase
    .from(BACKGROUND_JOBS_TABLE)
    .insert(payload)
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Falha ao criar background job');
  }

  return data as BackgroundJobListItem;
}

export async function createBackgroundJobItems(items: CreateBackgroundJobItemInput[]): Promise<BackgroundJobItem[]> {
  if (items.length === 0) return [];

  const payload = items.map((item) => ({
    id: item.id,
    job_id: item.jobId,
    user_id: item.userId,
    source_table: item.sourceTable ?? null,
    source_record_id: item.sourceRecordId ?? null,
    item_key: item.itemKey ?? null,
    label: item.label,
    status: item.status ?? 'pending',
    progress_current: item.progressCurrent ?? 0,
    progress_total: item.progressTotal ?? 0,
    started_at: item.startedAt ?? null,
    completed_at: item.completedAt ?? null,
    error_message: item.errorMessage ?? null,
    metadata: item.metadata ?? {},
  }));

  const { data, error } = await supabase
    .from(BACKGROUND_JOB_ITEMS_TABLE)
    .insert(payload)
    .select('*');

  if (error) throw error;

  return (data || []) as BackgroundJobItem[];
}

export async function updateBackgroundJob(jobId: string, updates: BackgroundJobUpdateInput): Promise<void> {
  const { error } = await supabase
    .from(BACKGROUND_JOBS_TABLE)
    .update(updates)
    .eq('id', jobId);

  if (error) throw error;
}

export async function updateBackgroundJobItem(itemId: string, updates: BackgroundJobItemUpdateInput): Promise<void> {
  const { error } = await supabase
    .from(BACKGROUND_JOB_ITEMS_TABLE)
    .update(updates)
    .eq('id', itemId);

  if (error) throw error;
}

export async function appendBackgroundJobEvent(event: BackgroundJobEventInput): Promise<void> {
  const { error } = await supabase
    .from(BACKGROUND_JOB_EVENTS_TABLE)
    .insert({
      user_id: event.userId,
      job_id: event.jobId,
      job_item_id: event.jobItemId ?? null,
      event_type: event.eventType,
      level: event.level ?? 'info',
      message: event.message,
      metadata: event.metadata ?? {},
    });

  if (error) throw error;
}
