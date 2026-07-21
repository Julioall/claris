import { userHasPermission as checkPermission } from '../_shared/auth/mod.ts'
import {
  createServiceClient,
  type AppSupabaseClient,
  type Json,
} from '../_shared/db/mod.ts'
import type {
  BulkJobDto,
  BulkJobRecipientDto,
  BulkJobStatusDto,
  ScheduledMessageDto,
  ScheduledMessageStatusDto,
} from './contract.ts'
import {
  resolveAuthorizedRecipients,
  type BulkRecipientSelection,
} from '../_shared/domain/bulk-messaging/audience.ts'
import type { BulkMessageRecipientDraft } from '../_shared/domain/bulk-messaging/repository.ts'

export interface ScheduledMessageWriteRecord {
  executionContext: Json
  filterContext: Json
  messageContent: string
  notes: string | null
  recipientCount: number | null
  scheduledAt: string
  templateId: string | null
  title: string
}

export interface CampaignsRepository {
  createScheduledMessage(actorId: string, input: ScheduledMessageWriteRecord): Promise<ScheduledMessageDto>
  deleteScheduledMessage(actorId: string, messageId: string): Promise<boolean>
  findBulkJob(actorId: string, jobId: string): Promise<BulkJobDto | null>
  findScheduledMessage(actorId: string, messageId: string): Promise<ScheduledMessageDto | null>
  isTemplateOwned(actorId: string, templateId: string): Promise<boolean>
  isWhatsappInstanceAccessible(actorId: string, instanceId: string): Promise<boolean>
  listBulkJobRecipients(input: {
    jobId: string
    limit: number
    offset: number
  }): Promise<{ items: BulkJobRecipientDto[]; totalCount: number }>
  listBulkJobs(input: {
    actorId: string
    limit: number
    offset: number
    search?: string
    statuses?: BulkJobStatusDto[]
  }): Promise<{ items: BulkJobDto[]; totalCount: number }>
  listScheduledMessages(input: {
    actorId: string
    limit: number
    offset: number
    search?: string
    statuses?: ScheduledMessageStatusDto[]
  }): Promise<{ items: ScheduledMessageDto[]; totalCount: number }>
  resolveRecipients(actorId: string, selections: BulkRecipientSelection[]): Promise<BulkMessageRecipientDraft[]>
  transitionScheduledMessage(input: {
    actorId: string
    expectedStatus: ScheduledMessageStatusDto
    messageId: string
    nextStatus: ScheduledMessageStatusDto
    timestamp: string
  }): Promise<ScheduledMessageDto | null>
  updateScheduledMessage(
    actorId: string,
    messageId: string,
    input: ScheduledMessageWriteRecord,
  ): Promise<ScheduledMessageDto | null>
  userHasPermission(actorId: string, permission: string): Promise<boolean>
}

type BulkJobRow = {
  completed_at: string | null
  created_at: string
  error_message: string | null
  failed_count: number
  id: string
  message_content: string
  origin: string
  sent_count: number
  started_at: string | null
  status: string
  template_id: string | null
  total_recipients: number
}

type RecipientRow = {
  error_message: string | null
  id: string
  moodle_user_id: string
  personalized_message: string | null
  sent_at: string | null
  status: string
  student_name: string
}

type ScheduledMessageRow = {
  completed_at: string | null
  created_at: string
  error_message: string | null
  executed_bulk_job_id: string | null
  execution_attempts: number
  execution_context: Json
  failed_count: number
  filter_context: Json | null
  id: string
  last_execution_at: string | null
  message_content: string
  notes: string | null
  origin: string
  recipient_count: number | null
  result_context: Json | null
  scheduled_at: string
  sent_count: number
  started_at: string | null
  status: string
  template_id: string | null
  title: string
  updated_at: string
}

function asRecord(value: Json | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function camelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_match, character: string) => character.toUpperCase())
}

function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [camelKey(key), camelize(entry)]),
  )
}

function toBulkJob(row: BulkJobRow): BulkJobDto {
  return {
    completedAt: row.completed_at,
    createdAt: row.created_at,
    errorMessage: row.error_message,
    failedCount: row.failed_count,
    id: row.id,
    messageContent: row.message_content,
    origin: row.origin === 'ia' ? 'ia' : 'manual',
    sentCount: row.sent_count,
    startedAt: row.started_at,
    status: row.status as BulkJobStatusDto,
    templateId: row.template_id,
    totalRecipients: row.total_recipients,
  }
}

function toRecipient(row: RecipientRow): BulkJobRecipientDto {
  return {
    errorMessage: row.error_message,
    id: row.id,
    moodleUserId: row.moodle_user_id,
    personalizedMessage: row.personalized_message,
    sentAt: row.sent_at,
    status: row.status as BulkJobRecipientDto['status'],
    studentName: row.student_name,
  }
}

function toScheduledMessage(row: ScheduledMessageRow): ScheduledMessageDto {
  const filterContext = asRecord(row.filter_context)
  const executionContext = asRecord(row.execution_context)
  const channel = filterContext.channel === 'whatsapp' || executionContext.channel === 'whatsapp'
    ? 'whatsapp'
    : 'moodle'
  const rawInstanceId = filterContext.whatsapp_instance_id ?? executionContext.whatsapp_instance_id
  return {
    channel,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    errorMessage: row.error_message,
    executedBulkJobId: row.executed_bulk_job_id,
    executionAttempts: row.execution_attempts,
    executionContext: camelize(executionContext) as Record<string, unknown>,
    failedCount: row.failed_count,
    id: row.id,
    lastExecutionAt: row.last_execution_at,
    messageContent: row.message_content,
    notes: row.notes,
    origin: row.origin === 'ia' ? 'ia' : 'manual',
    recipientCount: row.recipient_count,
    resultContext: row.result_context
      ? camelize(asRecord(row.result_context)) as Record<string, unknown>
      : null,
    scheduledAt: row.scheduled_at,
    sentCount: row.sent_count,
    startedAt: row.started_at,
    status: row.status as ScheduledMessageStatusDto,
    templateId: row.template_id,
    title: row.title,
    updatedAt: row.updated_at,
    whatsappInstanceId: typeof rawInstanceId === 'string' ? rawInstanceId : null,
  }
}

function scheduledPatch(input: ScheduledMessageWriteRecord) {
  return {
    execution_context: input.executionContext,
    filter_context: input.filterContext,
    message_content: input.messageContent,
    notes: input.notes,
    recipient_count: input.recipientCount,
    scheduled_at: input.scheduledAt,
    template_id: input.templateId,
    title: input.title,
  }
}

export function createCampaignsRepository(
  db: AppSupabaseClient = createServiceClient(),
): CampaignsRepository {
  return {
    userHasPermission: (actorId, permission) => checkPermission(db, actorId, permission),
    resolveRecipients: (actorId, selections) => resolveAuthorizedRecipients(db, actorId, selections),

    async listBulkJobs(input) {
      let query = db
        .from('bulk_message_jobs')
        .select('*', { count: 'exact' })
        .eq('user_id', input.actorId)
        .order('created_at', { ascending: false })
        .order('id')
      if (input.statuses?.length) query = query.in('status', input.statuses)
      if (input.search) query = query.ilike('message_content', `%${input.search}%`)
      const { data, error, count } = await query.range(input.offset, input.offset + input.limit - 1)
      if (error) throw error
      return {
        items: (data ?? []).map((row) => toBulkJob(row as BulkJobRow)),
        totalCount: count ?? 0,
      }
    },

    async findBulkJob(actorId, jobId) {
      const { data, error } = await db
        .from('bulk_message_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('user_id', actorId)
        .maybeSingle()
      if (error) throw error
      return data ? toBulkJob(data as BulkJobRow) : null
    },

    async listBulkJobRecipients(input) {
      const { data, error, count } = await db
        .from('bulk_message_recipients')
        .select('*', { count: 'exact' })
        .eq('job_id', input.jobId)
        .order('student_name')
        .order('id')
        .range(input.offset, input.offset + input.limit - 1)
      if (error) throw error
      return {
        items: (data ?? []).map((row) => toRecipient(row as RecipientRow)),
        totalCount: count ?? 0,
      }
    },

    async listScheduledMessages(input) {
      let query = db
        .from('scheduled_messages')
        .select('*', { count: 'exact' })
        .eq('user_id', input.actorId)
        .order('scheduled_at')
        .order('id')
      if (input.statuses?.length) query = query.in('status', input.statuses)
      if (input.search) {
        query = query.or(`title.ilike.%${input.search}%,message_content.ilike.%${input.search}%`)
      }
      const { data, error, count } = await query.range(input.offset, input.offset + input.limit - 1)
      if (error) throw error
      return {
        items: (data ?? []).map((row) => toScheduledMessage(row as ScheduledMessageRow)),
        totalCount: count ?? 0,
      }
    },

    async findScheduledMessage(actorId, messageId) {
      const { data, error } = await db
        .from('scheduled_messages')
        .select('*')
        .eq('id', messageId)
        .eq('user_id', actorId)
        .maybeSingle()
      if (error) throw error
      return data ? toScheduledMessage(data as ScheduledMessageRow) : null
    },

    async isTemplateOwned(actorId, templateId) {
      const { data, error } = await db
        .from('message_templates')
        .select('id')
        .eq('id', templateId)
        .eq('user_id', actorId)
        .maybeSingle()
      if (error) throw error
      return Boolean(data)
    },

    async isWhatsappInstanceAccessible(actorId, instanceId) {
      const { data, error } = await db
        .from('app_service_instances')
        .select('owner_user_id, scope, service_type, is_active, is_blocked')
        .eq('id', instanceId)
        .maybeSingle()
      if (error) throw error
      return Boolean(
        data
        && data.service_type === 'whatsapp'
        && data.is_active
        && !data.is_blocked
        && (data.scope === 'shared' || data.owner_user_id === actorId),
      )
    },

    async createScheduledMessage(actorId, input) {
      const { data, error } = await db
        .from('scheduled_messages')
        .insert({
          ...scheduledPatch(input),
          origin: 'manual',
          user_id: actorId,
        })
        .select('*')
        .single()
      if (error) throw error
      return toScheduledMessage(data as ScheduledMessageRow)
    },

    async updateScheduledMessage(actorId, messageId, input) {
      const { data, error } = await db
        .from('scheduled_messages')
        .update(scheduledPatch(input))
        .eq('id', messageId)
        .eq('user_id', actorId)
        .in('status', ['pending', 'paused'])
        .select('*')
        .maybeSingle()
      if (error) throw error
      return data ? toScheduledMessage(data as ScheduledMessageRow) : null
    },

    async transitionScheduledMessage(input) {
      const patch = {
        status: input.nextStatus,
        ...(input.nextStatus === 'cancelled' ? { completed_at: input.timestamp } : {}),
      }
      const { data, error } = await db
        .from('scheduled_messages')
        .update(patch)
        .eq('id', input.messageId)
        .eq('user_id', input.actorId)
        .eq('status', input.expectedStatus)
        .select('*')
        .maybeSingle()
      if (error) throw error
      return data ? toScheduledMessage(data as ScheduledMessageRow) : null
    },

    async deleteScheduledMessage(actorId, messageId) {
      const { data, error } = await db
        .from('scheduled_messages')
        .delete()
        .eq('id', messageId)
        .eq('user_id', actorId)
        .neq('status', 'processing')
        .select('id')
        .maybeSingle()
      if (error) throw error
      return Boolean(data)
    },
  }
}
