import { supabase } from '@/integrations/supabase/client';
import type { Json, TablesUpdate } from '@/integrations/supabase/types';

const BACKGROUND_JOBS_TABLE = 'background_jobs' as never;
const BACKGROUND_JOB_ITEMS_TABLE = 'background_job_items' as never;
const BACKGROUND_JOB_EVENTS_TABLE = 'background_job_events' as never;

export type AdminBackgroundJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AdminBackgroundJobUser {
  id: string;
  full_name: string;
  moodle_username: string;
}

export interface AdminBackgroundJobRow {
  id: string;
  user_id: string;
  course_id: string | null;
  job_type: string;
  source: string;
  source_table: string | null;
  source_record_id: string | null;
  title: string;
  description: string | null;
  status: AdminBackgroundJobStatus;
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
  user: AdminBackgroundJobUser | null;
}

export interface AdminBackgroundJobItemRow {
  id: string;
  job_id: string;
  user_id: string;
  source_table: string | null;
  source_record_id: string | null;
  item_key: string | null;
  label: string;
  status: string;
  progress_current: number;
  progress_total: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface AdminBackgroundJobEventRow {
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

export interface AdminBackgroundJobDetails {
  job: AdminBackgroundJobRow;
  items: AdminBackgroundJobItemRow[];
  events: AdminBackgroundJobEventRow[];
}

export interface AdminBackgroundJobFilters {
  status?: AdminBackgroundJobStatus | 'all';
  source?: string | 'all';
  jobType?: string | 'all';
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedAdminBackgroundJobs {
  items: AdminBackgroundJobRow[];
  totalCount: number;
}

interface UserRow {
  id: string;
  full_name: string;
  moodle_username: string;
}

function getScheduledMessageSourceId(job: Pick<AdminBackgroundJobRow, 'id' | 'source_table' | 'source_record_id'>) {
  if (job.source_table !== 'scheduled_messages') return null;
  return job.source_record_id || job.id;
}

async function appendAdminJobEvent(job: AdminBackgroundJobRow, eventType: string, level: 'info' | 'warning', message: string) {
  try {
    const { error } = await supabase
      .from(BACKGROUND_JOB_EVENTS_TABLE)
      .insert({
        user_id: job.user_id,
        job_id: job.id,
        event_type: eventType,
        level,
        message,
        metadata: {
          origin: 'admin_jobs_panel',
        },
      });

    if (error) {
      console.error('Failed to append admin background job event:', error);
    }
  } catch (error) {
    console.error('Failed to append admin background job event:', error);
  }
}

export function canAdminRetryBackgroundJob(job: Pick<AdminBackgroundJobRow, 'id' | 'source_table' | 'source_record_id' | 'status'>) {
  return Boolean(getScheduledMessageSourceId(job)) && ['failed', 'cancelled'].includes(job.status);
}

export function canAdminCancelBackgroundJob(job: Pick<AdminBackgroundJobRow, 'id' | 'source_table' | 'source_record_id' | 'status'>) {
  return Boolean(getScheduledMessageSourceId(job)) && job.status === 'pending';
}

async function loadUsersMap(userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

  if (uniqueUserIds.length === 0) {
    return new Map<string, AdminBackgroundJobUser>();
  }

  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, moodle_username')
    .in('id', uniqueUserIds);

  if (error) throw error;

  return new Map(
    ((data || []) as UserRow[]).map((user) => [
      user.id,
      {
        id: user.id,
        full_name: user.full_name,
        moodle_username: user.moodle_username,
      },
    ]),
  );
}

export async function listAdminBackgroundJobs(
  filters: AdminBackgroundJobFilters = {},
): Promise<PaginatedAdminBackgroundJobs> {
  const {
    jobType,
    page = 1,
    pageSize = 30,
    search,
    source,
    status,
  } = filters;

  const normalizedPage = Math.max(page, 1);
  const normalizedPageSize = Math.min(Math.max(pageSize, 1), 100);
  const from = (normalizedPage - 1) * normalizedPageSize;
  const to = from + normalizedPageSize - 1;

  let listQuery = supabase
    .from(BACKGROUND_JOBS_TABLE)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status && status !== 'all') {
    listQuery = listQuery.eq('status', status);
  }

  if (source && source !== 'all') {
    listQuery = listQuery.eq('source', source);
  }

  if (jobType && jobType !== 'all') {
    listQuery = listQuery.eq('job_type', jobType);
  }

  if (search?.trim()) {
    const normalizedSearch = search.trim();
    listQuery = listQuery.or(
      `title.ilike.%${normalizedSearch}%,description.ilike.%${normalizedSearch}%,job_type.ilike.%${normalizedSearch}%,source.ilike.%${normalizedSearch}%`,
    );
  }

  const { data, error, count } = await listQuery;

  if (error) throw error;

  const rows = (data || []) as Omit<AdminBackgroundJobRow, 'user'>[];
  const usersMap = await loadUsersMap(rows.map((row) => row.user_id));

  return {
    items: rows.map((row) => ({
      ...row,
      user: usersMap.get(row.user_id) ?? null,
    })),
    totalCount: count ?? 0,
  };
}

export async function getAdminBackgroundJobDetails(jobId: string): Promise<AdminBackgroundJobDetails> {
  const [{ data: jobData, error: jobError }, { data: itemsData, error: itemsError }, { data: eventsData, error: eventsError }] =
    await Promise.all([
      supabase
        .from(BACKGROUND_JOBS_TABLE)
        .select('*')
        .eq('id', jobId)
        .single(),
      supabase
        .from(BACKGROUND_JOB_ITEMS_TABLE)
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true }),
      supabase
        .from(BACKGROUND_JOB_EVENTS_TABLE)
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false }),
    ]);

  if (jobError || !jobData) {
    throw jobError ?? new Error('Job não encontrado');
  }

  if (itemsError) throw itemsError;
  if (eventsError) throw eventsError;

  const usersMap = await loadUsersMap([jobData.user_id as string]);
  const job = jobData as Omit<AdminBackgroundJobRow, 'user'>;

  return {
    job: {
      ...job,
      user: usersMap.get(job.user_id) ?? null,
    },
    items: (itemsData || []) as AdminBackgroundJobItemRow[],
    events: (eventsData || []) as AdminBackgroundJobEventRow[],
  };
}

export async function retryAdminBackgroundJob(job: AdminBackgroundJobRow): Promise<void> {
  const scheduledMessageId = getScheduledMessageSourceId(job);
  if (!scheduledMessageId) {
    throw new Error('Este job ainda nao suporta reprocessamento administrativo.');
  }

  const payload: TablesUpdate<'scheduled_messages'> = {
    status: 'pending',
    sent_count: 0,
    failed_count: 0,
    error_message: null,
    started_at: null,
    completed_at: null,
    result_context: {},
    executed_bulk_job_id: null,
    execution_attempts: 0,
    last_execution_at: null,
  };

  const { data, error } = await supabase
    .from('scheduled_messages')
    .update(payload)
    .eq('id', scheduledMessageId)
    .select('id')
    .single();

  if (error || !data) throw error ?? new Error('Agendamento nao encontrado para reenfileiramento.');

  await appendAdminJobEvent(
    job,
    'job_requeued',
    'warning',
    'Job reenfileirado manualmente pelo painel administrativo.',
  );
}

export async function cancelAdminBackgroundJob(job: AdminBackgroundJobRow): Promise<void> {
  const scheduledMessageId = getScheduledMessageSourceId(job);
  if (!scheduledMessageId) {
    throw new Error('Este job ainda nao suporta cancelamento administrativo.');
  }

  const payload: TablesUpdate<'scheduled_messages'> = {
    status: 'cancelled',
    completed_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('scheduled_messages')
    .update(payload)
    .eq('id', scheduledMessageId)
    .eq('status', 'pending')
    .select('id')
    .single();

  if (error || !data) throw error ?? new Error('Somente agendamentos pendentes podem ser cancelados.');

  await appendAdminJobEvent(
    job,
    'job_cancelled',
    'warning',
    'Job cancelado manualmente pelo painel administrativo.',
  );
}
