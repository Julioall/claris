import type {
  AppSupabaseClient,
  Enums,
  Tables,
  TablesInsert,
} from '../../db/mod.ts'
import {
  appendBackgroundJobEvent,
  createBackgroundJobItems,
  updateBackgroundJob,
  updateBackgroundJobItem,
  upsertBackgroundJob,
} from '../background-jobs/repository.ts'

export type BulkMessageJob = Tables<'bulk_message_jobs'>
export type BulkMessageRecipient = Tables<'bulk_message_recipients'>
export type BulkMessageJobOrigin = 'manual' | 'ia'

async function syncBackgroundJob(task: () => Promise<void>) {
  try {
    await task()
  } catch (error) {
    console.error('[bulk-messaging][background-jobs] sync failed:', error)
  }
}

async function mirrorBulkMessageJobCreate(
  supabase: AppSupabaseClient,
  input: {
    job: BulkMessageJob
    recipients: BulkMessageRecipient[]
    userId: string
  },
) {
  await upsertBackgroundJob(supabase, {
    id: input.job.id,
    userId: input.userId,
    jobType: 'bulk_message',
    source: 'messages',
    sourceTable: 'bulk_message_jobs',
    sourceRecordId: input.job.id,
    title: 'Envio em massa',
    description: input.job.message_content,
    status: input.job.status,
    totalItems: input.job.total_recipients,
    processedItems: input.job.sent_count + input.job.failed_count,
    successCount: input.job.sent_count,
    errorCount: input.job.failed_count,
    startedAt: input.job.started_at,
    completedAt: input.job.completed_at,
    errorMessage: input.job.error_message,
    metadata: {
      origin: input.job.origin,
      template_id: input.job.template_id,
    },
  })

  await createBackgroundJobItems(supabase, input.recipients.map((recipient) => ({
    id: recipient.id,
    jobId: input.job.id,
    userId: input.userId,
    sourceTable: 'bulk_message_recipients',
    sourceRecordId: recipient.id,
    itemKey: recipient.student_id,
    label: recipient.student_name,
    status: recipient.status === 'sent' ? 'completed' : recipient.status,
    progressCurrent: recipient.status === 'pending' ? 0 : 1,
    progressTotal: 1,
    completedAt: recipient.sent_at,
    errorMessage: recipient.error_message,
    metadata: {
      moodle_user_id: recipient.moodle_user_id,
    },
  })))

  await appendBackgroundJobEvent(supabase, {
    userId: input.userId,
    jobId: input.job.id,
    eventType: 'job_created',
    message: `Job criado com ${input.recipients.length} destinatário(s).`,
    metadata: {
      origin: input.job.origin,
    },
  })
}

export interface BulkMessageRecipientDraft {
  moodleUserId: string
  personalizedMessage?: string | null
  studentId: string
  studentName: string
}

interface CreateBulkMessageJobInput {
  messageContent: string
  origin: BulkMessageJobOrigin
  recipients: BulkMessageRecipientDraft[]
  templateId?: string | null
  userId: string
}

export async function findJobForUser(
  supabase: AppSupabaseClient,
  jobId: string,
  userId: string,
): Promise<BulkMessageJob | null> {
  const { data, error } = await supabase
    .from('bulk_message_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function findDuplicateActiveJob(
  supabase: AppSupabaseClient,
  userId: string,
  messageContent: string,
  totalRecipients: number,
): Promise<Pick<BulkMessageJob, 'created_at' | 'id' | 'status'> | null> {
  const { data, error } = await supabase
    .from('bulk_message_jobs')
    .select('id, status, created_at')
    .eq('user_id', userId)
    .eq('message_content', messageContent)
    .eq('total_recipients', totalRecipients)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function createJobWithRecipients(
  supabase: AppSupabaseClient,
  input: CreateBulkMessageJobInput,
): Promise<BulkMessageJob> {
  let job: BulkMessageJob | null = null

  try {
    const jobInsert: TablesInsert<'bulk_message_jobs'> = {
      message_content: input.messageContent,
      origin: input.origin,
      status: 'pending',
      template_id: input.templateId ?? null,
      total_recipients: input.recipients.length,
      user_id: input.userId,
    }

    const { data, error } = await supabase
      .from('bulk_message_jobs')
      .insert(jobInsert)
      .select('*')
      .single()

    if (error || !data) {
      throw error ?? new Error('Falha ao criar job de envio em massa')
    }

    job = data

    const recipientsInsert: TablesInsert<'bulk_message_recipients'>[] = input.recipients.map((recipient) => ({
      job_id: job.id,
      moodle_user_id: recipient.moodleUserId,
      personalized_message: recipient.personalizedMessage ?? null,
      status: 'pending',
      student_id: recipient.studentId,
      student_name: recipient.studentName,
    }))

    const { data: recipientsData, error: recipientsError } = await supabase
      .from('bulk_message_recipients')
      .insert(recipientsInsert)
      .select('*')

    if (recipientsError) {
      throw recipientsError
    }

    await syncBackgroundJob(async () => {
      await mirrorBulkMessageJobCreate(supabase, {
        job,
        recipients: (recipientsData ?? []) as BulkMessageRecipient[],
        userId: input.userId,
      })
    })

    return job
  } catch (error) {
    if (job) {
      await failJob(
        supabase,
        job.id,
        error instanceof Error ? error.message : 'Falha ao preparar envio em massa',
        new Date().toISOString(),
      )
    }

    throw error
  }
}

export async function listPendingRecipients(
  supabase: AppSupabaseClient,
  jobId: string,
): Promise<BulkMessageRecipient[]> {
  const { data, error } = await supabase
    .from('bulk_message_recipients')
    .select('*')
    .eq('job_id', jobId)
    .eq('status', 'pending')
    .order('created_at')

  if (error) throw error
  return data ?? []
}

export async function listRecipientsForJob(
  supabase: AppSupabaseClient,
  jobId: string,
): Promise<BulkMessageRecipient[]> {
  const { data, error } = await supabase
    .from('bulk_message_recipients')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at')

  if (error) throw error
  return data ?? []
}

export async function markJobProcessing(
  supabase: AppSupabaseClient,
  jobId: string,
  timestamp: string,
): Promise<void> {
  const { error } = await supabase
    .from('bulk_message_jobs')
    .update({ status: 'processing', started_at: timestamp })
    .eq('id', jobId)

  if (error) throw error

  await syncBackgroundJob(async () => {
    const job = await findJobById(supabase, jobId)
    if (!job) return

    await updateBackgroundJob(supabase, jobId, {
      started_at: timestamp,
      status: 'processing',
      processed_items: job.sent_count + job.failed_count,
      success_count: job.sent_count,
      error_count: job.failed_count,
    })
    await appendBackgroundJobEvent(supabase, {
      userId: job.user_id,
      jobId,
      eventType: 'job_processing',
      message: 'Job entrou em processamento.',
    })
  })
}

export async function markJobProgress(
  supabase: AppSupabaseClient,
  jobId: string,
  sentCount: number,
  failedCount: number,
): Promise<void> {
  const { error } = await supabase
    .from('bulk_message_jobs')
    .update({ sent_count: sentCount, failed_count: failedCount })
    .eq('id', jobId)

  if (error) throw error

  await syncBackgroundJob(async () => {
    const job = await findJobById(supabase, jobId)
    if (!job) return

    await updateBackgroundJob(supabase, jobId, {
      processed_items: sentCount + failedCount,
      success_count: sentCount,
      error_count: failedCount,
      status: 'processing',
    })
    await appendBackgroundJobEvent(supabase, {
      userId: job.user_id,
      jobId,
      eventType: 'job_progress',
      message: `Progresso atualizado: ${sentCount} enviado(s) e ${failedCount} falha(s).`,
      metadata: {
        processed_items: sentCount + failedCount,
        success_count: sentCount,
        error_count: failedCount,
      },
    })
  })
}

export async function finalizeJob(
  supabase: AppSupabaseClient,
  jobId: string,
  status: Enums<'bulk_message_status'>,
  sentCount: number,
  failedCount: number,
  timestamp: string,
): Promise<void> {
  const { error } = await supabase
    .from('bulk_message_jobs')
    .update({
      completed_at: timestamp,
      failed_count: failedCount,
      sent_count: sentCount,
      status,
    })
    .eq('id', jobId)

  if (error) throw error

  await syncBackgroundJob(async () => {
    const job = await findJobById(supabase, jobId)
    if (!job) return

    await updateBackgroundJob(supabase, jobId, {
      completed_at: timestamp,
      error_count: failedCount,
      processed_items: sentCount + failedCount,
      status: status as 'completed' | 'failed' | 'cancelled',
      success_count: sentCount,
    })
    await appendBackgroundJobEvent(supabase, {
      userId: job.user_id,
      jobId,
      eventType: 'job_completed',
      level: status === 'failed' ? 'error' : 'info',
      message: status === 'failed'
        ? `Job finalizado com falha total. ${failedCount} erro(s).`
        : `Job concluído com ${sentCount} sucesso(s) e ${failedCount} erro(s).`,
      metadata: {
        status,
        success_count: sentCount,
        error_count: failedCount,
      },
    })
  })
}

export async function failJob(
  supabase: AppSupabaseClient,
  jobId: string,
  errorMessage: string,
  timestamp: string,
): Promise<void> {
  const { error } = await supabase
    .from('bulk_message_jobs')
    .update({
      completed_at: timestamp,
      error_message: errorMessage,
      status: 'failed',
    })
    .eq('id', jobId)

  if (error) throw error

  await syncBackgroundJob(async () => {
    const job = await findJobById(supabase, jobId)
    if (!job) return

    await updateBackgroundJob(supabase, jobId, {
      completed_at: timestamp,
      error_message: errorMessage,
      status: 'failed',
    })
    await appendBackgroundJobEvent(supabase, {
      userId: job.user_id,
      jobId,
      eventType: 'job_failed',
      level: 'error',
      message: errorMessage,
    })
  })
}

export async function markRecipientSent(
  supabase: AppSupabaseClient,
  recipientId: string,
  timestamp: string,
): Promise<void> {
  const { error } = await supabase
    .from('bulk_message_recipients')
    .update({ sent_at: timestamp, status: 'sent' })
    .eq('id', recipientId)

  if (error) throw error

  await syncBackgroundJob(async () => {
    await updateBackgroundJobItem(supabase, recipientId, {
      completed_at: timestamp,
      error_message: null,
      progress_current: 1,
      progress_total: 1,
      status: 'completed',
    })
  })
}

export async function markRecipientFailed(
  supabase: AppSupabaseClient,
  recipientId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await supabase
    .from('bulk_message_recipients')
    .update({ error_message: errorMessage, status: 'failed' })
    .eq('id', recipientId)

  if (error) throw error

  await syncBackgroundJob(async () => {
    await updateBackgroundJobItem(supabase, recipientId, {
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
      progress_current: 1,
      progress_total: 1,
      status: 'failed',
    })
  })
}

async function findJobById(
  supabase: AppSupabaseClient,
  jobId: string,
): Promise<BulkMessageJob | null> {
  const { data, error } = await supabase
    .from('bulk_message_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()

  if (error) throw error
  return data
}
