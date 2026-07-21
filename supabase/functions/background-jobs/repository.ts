import { isApplicationAdmin } from '../_shared/auth/mod.ts'
import { createServiceClient, type AppSupabaseClient, type Json } from '../_shared/db/mod.ts'
import {
  appendBackgroundJobEvent,
  findBackgroundJobById,
  updateBackgroundJobWhenStatus,
  type BackgroundJobRecord,
} from '../_shared/domain/background-jobs/repository.ts'
import { scheduleMoodleSyncJob } from '../_shared/domain/moodle-sync/job-runner.ts'
import type {
  BackgroundJobEventDto,
  BackgroundJobItemDto,
  BackgroundJobUserDto,
} from './contract.ts'
import type { BackgroundJobsPayload } from './payload.ts'

interface UserRow {
  full_name: string
  id: string
  moodle_username: string
}

export interface BackgroundJobsRepository {
  adminCancel(actorId: string, jobId: string): Promise<BackgroundJobRecord | null>
  adminGetDetails(jobId: string): Promise<{
    events: BackgroundJobEventDto[]
    items: BackgroundJobItemDto[]
    job: BackgroundJobRecord
    user: BackgroundJobUserDto | null
  } | null>
  adminList(input: {
    filters: Extract<BackgroundJobsPayload, { action: 'admin_list' }>['filters']
    limit: number
    offset: number
  }): Promise<{ items: Array<{ job: BackgroundJobRecord; user: BackgroundJobUserDto | null }>; totalCount: number }>
  adminRetry(actorId: string, jobId: string): Promise<BackgroundJobRecord | null>
  isAdmin(actorId: string): Promise<boolean>
  listActive(actorId: string): Promise<BackgroundJobRecord[]>
}

function mapUser(row: UserRow): BackgroundJobUserDto {
  return { fullName: row.full_name, id: row.id, moodleUsername: row.moodle_username }
}

async function loadUsers(
  supabase: AppSupabaseClient,
  userIds: string[],
): Promise<Map<string, BackgroundJobUserDto>> {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return new Map()
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, moodle_username')
    .in('id', unique)
  if (error) throw error
  return new Map(((data ?? []) as UserRow[]).map((row) => [row.id, mapUser(row)]))
}

function mapItem(row: Record<string, unknown>): BackgroundJobItemDto {
  return {
    completedAt: row.completed_at as string | null,
    createdAt: row.created_at as string,
    errorMessage: row.error_message as string | null,
    id: row.id as string,
    itemKey: row.item_key as string | null,
    jobId: row.job_id as string,
    label: row.label as string,
    metadata: row.metadata as Json,
    progressCurrent: row.progress_current as number,
    progressTotal: row.progress_total as number,
    sourceRecordId: row.source_record_id as string | null,
    sourceTable: row.source_table as string | null,
    startedAt: row.started_at as string | null,
    status: row.status as string,
    updatedAt: row.updated_at as string,
    userId: row.user_id as string,
  }
}

function mapEvent(row: Record<string, unknown>): BackgroundJobEventDto {
  return {
    createdAt: row.created_at as string,
    eventType: row.event_type as string,
    id: row.id as string,
    jobId: row.job_id as string,
    jobItemId: row.job_item_id as string | null,
    level: row.level as 'info' | 'warning' | 'error',
    message: row.message as string,
    metadata: row.metadata as Json,
    userId: row.user_id as string,
  }
}

function scheduledMessageId(job: BackgroundJobRecord): string | null {
  if (job.source_table !== 'scheduled_messages') return null
  return job.source_record_id || job.id
}

async function appendAdminEvent(
  supabase: AppSupabaseClient,
  actorId: string,
  job: BackgroundJobRecord,
  eventType: string,
  message: string,
): Promise<void> {
  await appendBackgroundJobEvent(supabase, {
    userId: job.user_id,
    jobId: job.id,
    eventType,
    level: 'warning',
    message,
    metadata: { admin_actor_id: actorId, origin: 'admin_jobs_api' },
  })
}

export function createBackgroundJobsRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): BackgroundJobsRepository {
  return {
    isAdmin(actorId) {
      return isApplicationAdmin(supabase, actorId)
    },

    async listActive(actorId) {
      const { data, error } = await supabase
        .from('background_jobs')
        .select('*')
        .eq('user_id', actorId)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as BackgroundJobRecord[]
    },

    async adminList({ filters, limit, offset }) {
      let query = supabase
        .from('background_jobs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
      if (filters.status) query = query.eq('status', filters.status)
      if (filters.source) query = query.eq('source', filters.source)
      if (filters.jobType) query = query.eq('job_type', filters.jobType)
      if (filters.search) {
        const search = filters.search.replace(/[,()%_.]/g, ' ').replace(/\s+/g, ' ').trim()
        if (search) query = query.or(
          `title.ilike.%${search}%,description.ilike.%${search}%,job_type.ilike.%${search}%,source.ilike.%${search}%`,
        )
      }
      const { data, error, count } = await query
      if (error) throw error
      const jobs = (data ?? []) as BackgroundJobRecord[]
      const users = await loadUsers(supabase, jobs.map((job) => job.user_id))
      return {
        items: jobs.map((job) => ({ job, user: users.get(job.user_id) ?? null })),
        totalCount: count ?? 0,
      }
    },

    async adminGetDetails(jobId) {
      const job = await findBackgroundJobById(supabase, jobId)
      if (!job) return null
      const [itemsResult, eventsResult, users] = await Promise.all([
        supabase.from('background_job_items').select('*').eq('job_id', jobId).order('created_at', { ascending: true }),
        supabase.from('background_job_events').select('*').eq('job_id', jobId).order('created_at', { ascending: false }),
        loadUsers(supabase, [job.user_id]),
      ])
      if (itemsResult.error) throw itemsResult.error
      if (eventsResult.error) throw eventsResult.error
      return {
        job,
        user: users.get(job.user_id) ?? null,
        items: ((itemsResult.data ?? []) as Record<string, unknown>[]).map(mapItem),
        events: ((eventsResult.data ?? []) as Record<string, unknown>[]).map(mapEvent),
      }
    },

    async adminRetry(actorId, jobId) {
      const job = await findBackgroundJobById(supabase, jobId)
      if (!job) return null
      const scheduleId = scheduledMessageId(job)
      if (scheduleId) {
        const { data, error } = await supabase
          .from('scheduled_messages')
          .update({
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
          })
          .eq('id', scheduleId)
          .in('status', ['failed', 'cancelled'])
          .select('id')
          .maybeSingle()
        if (error) throw error
        if (!data) return null
        const refreshed = await findBackgroundJobById(supabase, jobId)
        if (!refreshed) return null
        await appendAdminEvent(supabase, actorId, refreshed, 'job_requeued', 'Job reenfileirado pelo painel administrativo.')
        return refreshed
      }

      if (job.job_type !== 'moodle_sync' || job.source !== 'sync') return null
      const reset = await updateBackgroundJobWhenStatus(supabase, job.id, ['failed', 'cancelled'], {
        completed_at: null,
        error_count: 0,
        error_message: null,
        processed_items: 0,
        started_at: null,
        status: 'pending',
        success_count: 0,
      })
      if (!reset) return null
      const { error } = await supabase.from('background_job_items').update({
        completed_at: null,
        error_message: null,
        progress_current: 0,
        started_at: null,
        status: 'pending',
      }).eq('job_id', job.id)
      if (error) throw error
      await appendAdminEvent(supabase, actorId, reset, 'job_requeued', 'Sincronizacao Moodle reenfileirada pelo administrador.')
      scheduleMoodleSyncJob(reset.id)
      return reset
    },

    async adminCancel(actorId, jobId) {
      const job = await findBackgroundJobById(supabase, jobId)
      if (!job) return null
      const scheduleId = scheduledMessageId(job)
      if (scheduleId) {
        const { data, error } = await supabase
          .from('scheduled_messages')
          .update({ status: 'cancelled', completed_at: new Date().toISOString() })
          .eq('id', scheduleId)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle()
        if (error) throw error
        if (!data) return null
        const refreshed = await findBackgroundJobById(supabase, jobId)
        if (!refreshed) return null
        await appendAdminEvent(supabase, actorId, refreshed, 'job_cancelled', 'Job cancelado pelo painel administrativo.')
        return refreshed
      }

      if (job.job_type !== 'moodle_sync' || job.source !== 'sync') return null
      const cancelled = await updateBackgroundJobWhenStatus(supabase, job.id, ['pending', 'processing'], {
        completed_at: new Date().toISOString(),
        status: 'cancelled',
      })
      if (!cancelled) return null
      await appendAdminEvent(supabase, actorId, cancelled, 'job_cancelled', 'Sincronizacao Moodle cancelada pelo administrador.')
      return cancelled
    },
  }
}
