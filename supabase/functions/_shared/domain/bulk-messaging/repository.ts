import type {
  AppSupabaseClient,
  Enums,
  Tables,
} from '../../db/mod.ts'

export type BulkMessageJob = Tables<'bulk_message_jobs'>
export type BulkMessageRecipient = Tables<'bulk_message_recipients'>

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