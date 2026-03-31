// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import {
  createHandler,
  errorResponse,
  expectBodyObject,
  jsonResponse,
  readOptionalPositiveInteger,
  readOptionalString,
} from '../_shared/http/mod.ts'
import type { HandlerContext } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import type { Json, Tables } from '../_shared/db/mod.ts'
import {
  appendBackgroundJobEvent,
  createBackgroundJobItems,
  updateBackgroundJobItem,
} from '../_shared/domain/background-jobs/repository.ts'
import {
  createJobWithRecipients,
  listRecipientsForJob,
} from '../_shared/domain/bulk-messaging/repository.ts'
import { processBulkMessageJob } from '../_shared/domain/bulk-messaging/service.ts'
import {
  findMoodleReauthCredentialByUserId,
  markMoodleReauthFailure,
  markMoodleReauthSuccess,
} from '../_shared/domain/moodle-reauth/repository.ts'
import { decryptMoodleReauthPayload } from '../_shared/security/moodle-reauth-crypto.ts'
import { getMoodleToken } from '../_shared/moodle/mod.ts'

interface RequestBody {
  dryRun: boolean
  limit: number
  scheduledMessageId?: string
}

interface ScheduledMessageExecutionContext {
  automatic_execution_supported?: boolean
  blocking_reason?: string
  channel?: 'moodle' | 'whatsapp'
  mode?: string
  moodle_url?: string
  recipient_snapshot?: ScheduledMessageRecipientSnapshot[]
  schedule?: ScheduleMetadata
  whatsapp_instance_id?: string | null
}

interface ScheduleMetadata {
  end_date?: string
  monthly_day?: number
  start_date?: string
  time?: string
  type?: string
  weekday?: number
}

interface ScheduledMessageRecipientSnapshot {
  moodle_user_id: string
  personalized_message?: string | null
  student_id: string
  student_name: string
}

interface ProcessingResult {
  messageId: string
  reason?: string
  status: 'failed' | 'processed' | 'skipped'
}

type ScheduledMessageRow = Tables<'scheduled_messages'>

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return false

  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function parseBody(rawBody: unknown, req: Request): RequestBody {
  const body = expectBodyObject(rawBody)
  const url = new URL(req.url)
  const queryLimit = url.searchParams.get('limit')
  const queryMessageId = url.searchParams.get('message_id')
  const queryDryRun = url.searchParams.get('dry_run')

  const limit = Math.min(
    readOptionalPositiveInteger(body, 'limit')
      ?? (queryLimit ? Number(queryLimit) : 10),
    50,
  )

  return {
    dryRun: parseBoolean(body.dry_run) || parseBoolean(queryDryRun),
    limit: Number.isFinite(limit) && limit > 0 ? limit : 10,
    scheduledMessageId: readOptionalString(body, 'scheduled_message_id', 255) ?? queryMessageId ?? undefined,
  }
}

function readSecret(req: Request): string | null {
  const bearerToken = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  const headerToken = req.headers.get('x-scheduled-messages-secret')?.trim()
  return headerToken || bearerToken || null
}

function hasValidSecret(req: Request): boolean {
  const expectedSecret = (Deno.env.get('SCHEDULED_MESSAGES_CRON_SECRET') ?? '').trim()
  if (!expectedSecret) return false
  return readSecret(req) === expectedSecret
}

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readScheduleMetadata(raw: unknown): ScheduleMetadata | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const type = readString(record.type)
  if (!type) return undefined

  return {
    type,
    end_date: readString(record.end_date),
    monthly_day: typeof record.monthly_day === 'number' ? record.monthly_day : undefined,
    start_date: readString(record.start_date),
    time: readString(record.time),
    weekday: typeof record.weekday === 'number' ? record.weekday : undefined,
  }
}

function isRecurringSchedule(schedule: ScheduleMetadata | undefined): boolean {
  if (!schedule) return false
  return schedule.type === 'daily'
    || schedule.type === 'weekly'
    || schedule.type === 'biweekly'
    || schedule.type === 'monthly'
}

function computeNextScheduledAt(
  currentScheduledAt: string,
  schedule: ScheduleMetadata,
): string | null {
  const current = new Date(currentScheduledAt)
  if (Number.isNaN(current.getTime())) return null

  let next: Date

  switch (schedule.type) {
    case 'daily':
      next = new Date(current)
      next.setDate(next.getDate() + 1)
      break

    case 'weekly':
      next = new Date(current)
      next.setDate(next.getDate() + 7)
      break

    case 'biweekly':
      next = new Date(current)
      next.setDate(next.getDate() + 14)
      break

    case 'monthly': {
      next = new Date(current)
      const requestedDay = schedule.monthly_day ?? current.getDate()
      next.setMonth(next.getMonth() + 1)
      next.setDate(1)
      const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
      next.setDate(Math.min(requestedDay, maxDay))

      if (schedule.time) {
        const [hours, minutes] = schedule.time.split(':').map(Number)
        if (Number.isFinite(hours)) next.setHours(hours)
        if (Number.isFinite(minutes)) next.setMinutes(minutes)
      }
      break
    }
    default:
      return null
  }

  if (schedule.end_date) {
    const endDate = new Date(schedule.end_date + 'T23:59:59')
    if (!Number.isNaN(endDate.getTime()) && next > endDate) {
      return null
    }
  }

  return next.toISOString()
}

function readExecutionContext(message: ScheduledMessageRow): ScheduledMessageExecutionContext {
  const executionContext = asRecord(message.execution_context)
  const filterContext = asRecord(message.filter_context)
  const channel = readString(executionContext.channel) ?? readString(filterContext.channel)

  const rawRecipients = executionContext.recipient_snapshot
  const recipientSnapshot = Array.isArray(rawRecipients)
    ? rawRecipients
        .map((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
          const record = entry as Record<string, unknown>
          const studentId = readString(record.student_id)
          const moodleUserId = readString(record.moodle_user_id)
          const studentName = readString(record.student_name)

          if (!studentId || !moodleUserId || !studentName) return null

          return {
            student_id: studentId,
            moodle_user_id: moodleUserId,
            student_name: studentName,
            personalized_message: readString(record.personalized_message) ?? null,
          }
        })
        .filter((entry): entry is ScheduledMessageRecipientSnapshot => entry !== null)
    : []

  return {
    automatic_execution_supported:
      typeof executionContext.automatic_execution_supported === 'boolean'
        ? executionContext.automatic_execution_supported
        : undefined,
    blocking_reason: readString(executionContext.blocking_reason),
    channel: channel === 'whatsapp' ? 'whatsapp' : 'moodle',
    mode: readString(executionContext.mode),
    moodle_url: readString(executionContext.moodle_url),
    recipient_snapshot: recipientSnapshot,
    schedule: readScheduleMetadata(executionContext.schedule),
    whatsapp_instance_id: readString(executionContext.whatsapp_instance_id) ?? null,
  }
}

function buildStaticFailure(
  executionContext: ScheduledMessageExecutionContext,
): { errorMessage: string; failureCode: string; failedCount: number } | null {
  const recipients = executionContext.recipient_snapshot ?? []

  if (recipients.length === 0) {
    if (executionContext.channel === 'whatsapp') {
      return {
        errorMessage:
          'Agendamento de WhatsApp ainda nao possui snapshot de destino. Recrie o agendamento a partir de um fluxo que congele os destinatarios.',
        failureCode: 'destination_snapshot_missing',
        failedCount: 0,
      }
    }

    return {
      errorMessage:
        'Agendamento legado sem snapshot de destinatarios. Recrie o agendamento a partir do envio em massa para torna-lo executavel.',
      failureCode: 'recipient_snapshot_missing',
      failedCount: 0,
    }
  }

  if (executionContext.channel !== 'moodle') {
    return {
      errorMessage:
        'O executor automatico atual ainda nao suporta processar este canal com o contexto armazenado.',
      failureCode: 'unsupported_channel',
      failedCount: recipients.length,
    }
  }

  if (!executionContext.moodle_url) {
    return {
      errorMessage:
        'O agendamento possui destinatarios congelados, mas nao possui moodle_url no contexto de execucao.',
      failureCode: 'moodle_url_missing',
      failedCount: recipients.length,
    }
  }

  return null
}

async function listBackgroundItems(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
): Promise<Array<{ id: string; item_key: string | null }>> {
  const { data, error } = await supabase
    .from('background_job_items')
    .select('id, item_key')
    .eq('job_id', jobId)

  if (error) throw error
  return (data ?? []) as Array<{ id: string; item_key: string | null }>
}

async function getOrCreateBackgroundItems(
  supabase: ReturnType<typeof createServiceClient>,
  message: ScheduledMessageRow,
  recipients: ScheduledMessageRecipientSnapshot[],
): Promise<Array<{ id: string; item_key: string | null }>> {
  if (recipients.length === 0) return []

  const existingItems = await listBackgroundItems(supabase, message.id)
  if (existingItems.length > 0) return existingItems

  const createdItems = await createBackgroundJobItems(supabase, recipients.map((recipient) => ({
    id: crypto.randomUUID(),
    jobId: message.id,
    userId: message.user_id,
    sourceTable: 'scheduled_messages',
    sourceRecordId: message.id,
    itemKey: recipient.student_id,
    label: recipient.student_name,
    status: 'pending',
    progressCurrent: 0,
    progressTotal: 1,
    metadata: {
      moodle_user_id: recipient.moodle_user_id,
      personalized_message: recipient.personalized_message ?? null,
      scheduled_message_id: message.id,
    },
  })))

  return createdItems.map((item) => ({
    id: item.id,
    item_key: item.item_key,
  }))
}

async function markBackgroundItemsFailed(
  supabase: ReturnType<typeof createServiceClient>,
  items: Array<{ id: string }>,
  errorMessage: string,
  timestamp: string,
): Promise<void> {
  await Promise.all(items.map((item) => updateBackgroundJobItem(supabase, item.id, {
    completed_at: timestamp,
    error_message: errorMessage,
    progress_current: 1,
    progress_total: 1,
    status: 'failed',
  })))
}

async function syncScheduledItemsFromBulkJob(
  supabase: ReturnType<typeof createServiceClient>,
  scheduledMessageId: string,
  bulkJobId: string,
  fallbackTimestamp: string,
): Promise<void> {
  const [backgroundItems, bulkRecipients] = await Promise.all([
    listBackgroundItems(supabase, scheduledMessageId),
    listRecipientsForJob(supabase, bulkJobId),
  ])

  const recipientsByStudentId = new Map(
    bulkRecipients.map((recipient) => [recipient.student_id, recipient]),
  )

  await Promise.all(backgroundItems.map(async (item) => {
    if (!item.item_key) return

    const recipient = recipientsByStudentId.get(item.item_key)
    if (!recipient) return

    await updateBackgroundJobItem(supabase, item.id, {
      completed_at: recipient.sent_at ?? fallbackTimestamp,
      error_message: recipient.error_message,
      progress_current: 1,
      progress_total: 1,
      status: recipient.status === 'sent' ? 'completed' : 'failed',
    })
  }))
}

async function listDueScheduledMessages(
  supabase: ReturnType<typeof createServiceClient>,
  input: RequestBody,
  nowIso: string,
): Promise<ScheduledMessageRow[]> {
  let query = supabase
    .from('scheduled_messages')
    .select('*')
    .eq('status', 'pending')
    .order('scheduled_at', { ascending: true })
    .limit(input.limit)

  if (input.scheduledMessageId) {
    query = query.eq('id', input.scheduledMessageId)
  } else {
    query = query.lte('scheduled_at', nowIso)
  }

  const { data, error } = await query

  if (error) throw error
  return (data ?? []) as ScheduledMessageRow[]
}

async function claimScheduledMessage(
  supabase: ReturnType<typeof createServiceClient>,
  message: ScheduledMessageRow,
  timestamp: string,
): Promise<ScheduledMessageRow | null> {
  const { data, error } = await supabase
    .from('scheduled_messages')
    .update({
      status: 'processing',
      started_at: message.started_at ?? timestamp,
      execution_attempts: message.execution_attempts + 1,
      last_execution_at: timestamp,
      error_message: null,
      result_context: {
        claimed_at: timestamp,
        outcome: 'processing',
      },
    })
    .eq('id', message.id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as ScheduledMessageRow | null
}

async function finalizeScheduledMessageFailure(
  supabase: ReturnType<typeof createServiceClient>,
  message: ScheduledMessageRow,
  items: Array<{ id: string }>,
  input: {
    errorMessage: string
    failedCount: number
    failureCode: string
    timestamp: string
  },
): Promise<void> {
  if (items.length > 0 && input.failedCount > 0) {
    await markBackgroundItemsFailed(supabase, items, input.errorMessage, input.timestamp)
  }

  const { error } = await supabase
    .from('scheduled_messages')
    .update({
      status: 'failed',
      completed_at: input.timestamp,
      error_message: input.errorMessage,
      failed_count: input.failedCount,
      sent_count: 0,
      result_context: {
        completed_at: input.timestamp,
        failure_code: input.failureCode,
        message: input.errorMessage,
        outcome: 'failed',
      },
    })
    .eq('id', message.id)

  if (error) throw error

  await appendBackgroundJobEvent(supabase, {
    userId: message.user_id,
    jobId: message.id,
    eventType: 'job_failed',
    level: 'error',
    message: input.errorMessage,
    metadata: {
      failure_code: input.failureCode,
      recipient_snapshot_count: items.length,
    },
  })
}

async function finalizeScheduledMessageSuccess(
  supabase: ReturnType<typeof createServiceClient>,
  message: ScheduledMessageRow,
  input: {
    bulkJobId: string
    failedCount: number
    sentCount: number
    status: 'completed' | 'failed'
    timestamp: string
  },
): Promise<void> {
  if (input.status === 'failed') {
    const { error } = await supabase
      .from('scheduled_messages')
      .update({
        status: 'failed',
        completed_at: input.timestamp,
        error_message: 'Nenhuma mensagem foi enviada com sucesso durante a execucao agendada.',
        executed_bulk_job_id: input.bulkJobId,
        failed_count: input.failedCount,
        sent_count: input.sentCount,
        result_context: {
          completed_at: input.timestamp,
          executed_bulk_job_id: input.bulkJobId,
          failed_count: input.failedCount,
          outcome: 'failed',
          sent_count: input.sentCount,
        },
      })
      .eq('id', message.id)

    if (error) throw error

    await appendBackgroundJobEvent(supabase, {
      userId: message.user_id,
      jobId: message.id,
      eventType: 'job_completed',
      level: 'error',
      message: `Execucao agendada falhou para todos os ${input.failedCount} destinatarios.`,
      metadata: {
        executed_bulk_job_id: input.bulkJobId,
        failed_count: input.failedCount,
        sent_count: input.sentCount,
      },
    })
    return
  }

  const executionContext = readExecutionContext(message)
  const schedule = executionContext.schedule
  const recurring = isRecurringSchedule(schedule)

  if (recurring && schedule) {
    const nextScheduledAt = computeNextScheduledAt(message.scheduled_at, schedule)

    if (nextScheduledAt) {
      const { error } = await supabase
        .from('scheduled_messages')
        .update({
          status: 'pending',
          scheduled_at: nextScheduledAt,
          completed_at: null,
          error_message: null,
          executed_bulk_job_id: input.bulkJobId,
          failed_count: 0,
          sent_count: 0,
          result_context: {
            last_execution_at: input.timestamp,
            last_bulk_job_id: input.bulkJobId,
            last_sent_count: input.sentCount,
            last_failed_count: input.failedCount,
            outcome: 'rescheduled',
            next_scheduled_at: nextScheduledAt,
          },
        })
        .eq('id', message.id)

      if (error) throw error

      await appendBackgroundJobEvent(supabase, {
        userId: message.user_id,
        jobId: message.id,
        eventType: 'job_rescheduled',
        level: 'info',
        message: `Rotina executada com ${input.sentCount} sucesso(s) e ${input.failedCount} falha(s). Proxima execucao: ${nextScheduledAt}.`,
        metadata: {
          executed_bulk_job_id: input.bulkJobId,
          failed_count: input.failedCount,
          next_scheduled_at: nextScheduledAt,
          sent_count: input.sentCount,
        },
      })
      return
    }

    // end_date reached — fall through to completion
  }

  // One-shot (specific_date) or routine past end_date → completed
  const { error } = await supabase
    .from('scheduled_messages')
    .update({
      status: 'completed',
      completed_at: input.timestamp,
      error_message: null,
      executed_bulk_job_id: input.bulkJobId,
      failed_count: input.failedCount,
      sent_count: input.sentCount,
      result_context: {
        completed_at: input.timestamp,
        executed_bulk_job_id: input.bulkJobId,
        failed_count: input.failedCount,
        outcome: 'completed',
        sent_count: input.sentCount,
      },
    })
    .eq('id', message.id)

  if (error) throw error

  await appendBackgroundJobEvent(supabase, {
    userId: message.user_id,
    jobId: message.id,
    eventType: 'job_completed',
    level: 'info',
    message: recurring
      ? `Rotina concluida (data final atingida) com ${input.sentCount} sucesso(s) e ${input.failedCount} falha(s).`
      : `Campanha concluida com ${input.sentCount} sucesso(s) e ${input.failedCount} falha(s).`,
    metadata: {
      executed_bulk_job_id: input.bulkJobId,
      failed_count: input.failedCount,
      sent_count: input.sentCount,
    },
  })
}

async function processScheduledMessage(
  supabase: ReturnType<typeof createServiceClient>,
  message: ScheduledMessageRow,
): Promise<ProcessingResult> {
  const timestamp = new Date().toISOString()
  const claimedMessage = await claimScheduledMessage(supabase, message, timestamp)

  if (!claimedMessage) {
    return {
      messageId: message.id,
      reason: 'claimed_by_other_worker',
      status: 'skipped',
    }
  }

  await appendBackgroundJobEvent(supabase, {
    userId: claimedMessage.user_id,
    jobId: claimedMessage.id,
    eventType: 'job_processing',
    message: 'Agendamento vencido foi reivindicado pelo executor.',
    metadata: {
      scheduled_at: claimedMessage.scheduled_at,
    },
  })

  const executionContext = readExecutionContext(claimedMessage)
  const recipients = executionContext.recipient_snapshot ?? []
  const items = await getOrCreateBackgroundItems(supabase, claimedMessage, recipients)
  const staticFailure = buildStaticFailure(executionContext)

  if (staticFailure) {
    await finalizeScheduledMessageFailure(supabase, claimedMessage, items, {
      errorMessage: staticFailure.errorMessage,
      failedCount: staticFailure.failedCount,
      failureCode: staticFailure.failureCode,
      timestamp,
    })

    return {
      messageId: claimedMessage.id,
      reason: staticFailure.failureCode,
      status: 'failed',
    }
  }

  try {
    const reauthCredential = await findMoodleReauthCredentialByUserId(supabase, claimedMessage.user_id)
    if (!reauthCredential?.reauth_enabled || !reauthCredential.credential_ciphertext) {
      await finalizeScheduledMessageFailure(supabase, claimedMessage, items, {
        errorMessage:
          'O usuario nao habilitou a reautorizacao automatica do Moodle para jobs em segundo plano.',
        failedCount: recipients.length,
        failureCode: 'reauthorization_not_enabled',
        timestamp,
      })

      return {
        messageId: claimedMessage.id,
        reason: 'reauthorization_not_enabled',
        status: 'failed',
      }
    }

    const reauthPayload = await decryptMoodleReauthPayload(reauthCredential.credential_ciphertext)
    const moodleUrl = executionContext.moodle_url || reauthCredential.moodle_url
    const tokenResponse = await getMoodleToken(
      moodleUrl,
      reauthCredential.moodle_username,
      reauthPayload.password,
      reauthCredential.moodle_service,
    )

    if (tokenResponse.error || !tokenResponse.token) {
      const errorMessage = tokenResponse.error || 'Falha ao renovar o token do Moodle.'
      await markMoodleReauthFailure(supabase, claimedMessage.user_id, errorMessage)
      await finalizeScheduledMessageFailure(supabase, claimedMessage, items, {
        errorMessage,
        failedCount: recipients.length,
        failureCode: executionContext.blocking_reason || 'reauthorization_failed',
        timestamp,
      })

      return {
        messageId: claimedMessage.id,
        reason: 'reauthorization_failed',
        status: 'failed',
      }
    }

    await markMoodleReauthSuccess(supabase, claimedMessage.user_id, timestamp)
    await appendBackgroundJobEvent(supabase, {
      userId: claimedMessage.user_id,
      jobId: claimedMessage.id,
      eventType: 'reauthorized',
      message: 'Token do Moodle renovado com sucesso para execucao do job.',
    })

    const bulkJob = await createJobWithRecipients(supabase, {
      messageContent: claimedMessage.message_content,
      origin: claimedMessage.origin as 'manual' | 'ia',
      recipients: recipients.map((recipient) => ({
        moodleUserId: recipient.moodle_user_id,
        personalizedMessage: recipient.personalized_message ?? null,
        studentId: recipient.student_id,
        studentName: recipient.student_name,
      })),
      userId: claimedMessage.user_id,
    })

    await appendBackgroundJobEvent(supabase, {
      userId: claimedMessage.user_id,
      jobId: claimedMessage.id,
      eventType: 'bulk_job_spawned',
      message: 'Job de envio em massa criado a partir do agendamento.',
      metadata: {
        bulk_job_id: bulkJob.id,
      },
    })

    const result = await processBulkMessageJob(
      supabase,
      claimedMessage.user_id,
      bulkJob,
      moodleUrl,
      tokenResponse.token,
    )

    await syncScheduledItemsFromBulkJob(supabase, claimedMessage.id, bulkJob.id, timestamp)
    await finalizeScheduledMessageSuccess(supabase, claimedMessage, {
      bulkJobId: bulkJob.id,
      failedCount: result.failed,
      sentCount: result.sent,
      status: result.status,
      timestamp,
    })

    return {
      messageId: claimedMessage.id,
      status: 'processed',
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro inesperado ao executar agendamento.'
    await markMoodleReauthFailure(supabase, claimedMessage.user_id, errorMessage).catch(() => undefined)
    await finalizeScheduledMessageFailure(supabase, claimedMessage, items, {
      errorMessage,
      failedCount: recipients.length,
      failureCode: 'scheduled_execution_error',
      timestamp,
    })

    return {
      messageId: claimedMessage.id,
      reason: 'scheduled_execution_error',
      status: 'failed',
    }
  }
}

const handler = async ({ body, req }: HandlerContext<RequestBody>): Promise<Response> => {
  if (!hasValidSecret(req)) {
    return errorResponse('Unauthorized', 401)
  }

  const supabase = createServiceClient()
  const nowIso = new Date().toISOString()
  const dueMessages = await listDueScheduledMessages(supabase, body, nowIso)

  if (body.dryRun) {
    return jsonResponse({
      due_count: dueMessages.length,
      dry_run: true,
      processed_at: nowIso,
      scheduled_message_ids: dueMessages.map((message) => message.id),
    })
  }

  const results: ProcessingResult[] = []
  for (const message of dueMessages) {
    results.push(await processScheduledMessage(supabase, message))
  }

  return jsonResponse({
    matched_count: dueMessages.length,
    processed_at: nowIso,
    results,
  })
}

Deno.serve(createHandler(handler, { parseBody }))
