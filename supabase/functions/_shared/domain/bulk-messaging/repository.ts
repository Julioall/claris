import type {
  AppSupabaseClient,
  Enums,
  Tables,
  TablesInsert,
} from '../../db/mod.ts'

export type BulkMessageJob = Tables<'bulk_message_jobs'>
export type BulkMessageRecipient = Tables<'bulk_message_recipients'>
export type BulkMessageJobOrigin = 'manual' | 'ia'

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

    const { error: recipientsError } = await supabase
      .from('bulk_message_recipients')
      .insert(recipientsInsert)

    if (recipientsError) {
      throw recipientsError
    }

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
}
