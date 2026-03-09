import { createHandler, errorResponse, jsonResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { callMoodleApi } from '../_shared/moodle/mod.ts'

const BATCH_SIZE = 5
const DELAY_BETWEEN_BATCHES_MS = 1000

Deno.serve(createHandler(async ({ body, userId }) => {
  const { job_id } = body as { job_id?: string }
  if (!job_id) return errorResponse('job_id is required')

  const db = createServiceClient()

  // Get job
  const { data: job, error: jobErr } = await db
    .from('bulk_message_jobs')
    .select('*')
    .eq('id', job_id)
    .eq('user_id', userId)
    .single()

  if (jobErr || !job) return errorResponse('Job not found')
  if (job.status !== 'pending') return errorResponse(`Job status is ${job.status}, expected pending`)

  // Get user's moodle credentials
  const { data: userData } = await db
    .from('users')
    .select('moodle_user_id')
    .eq('id', userId)
    .single()

  if (!userData) return errorResponse('User not found')

  // Get moodle session from request headers (passed via auth)
  const { moodleUrl, token } = body as { moodleUrl?: string; token?: string }
  if (!moodleUrl || !token) return errorResponse('Moodle credentials required')

  // Mark as processing
  await db.from('bulk_message_jobs').update({ status: 'processing', started_at: new Date().toISOString() }).eq('id', job_id)

  // Get pending recipients
  const { data: recipients } = await db
    .from('bulk_message_recipients')
    .select('*')
    .eq('job_id', job_id)
    .eq('status', 'pending')
    .order('created_at')

  if (!recipients || recipients.length === 0) {
    await db.from('bulk_message_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', job_id)
    return jsonResponse({ success: true, sent: 0 })
  }

  let sentCount = job.sent_count || 0
  let failedCount = job.failed_count || 0

  // Process in batches
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(async (r: any) => {
        try {
          const result = await callMoodleApi(moodleUrl, token, 'core_message_send_instant_messages', {
            'messages[0][touserid]': Number(r.moodle_user_id),
            'messages[0][text]': r.personalized_message || job.message_content,
            'messages[0][textformat]': 0,
          })

          const msgResult = Array.isArray(result) ? result[0] : result
          if (msgResult?.errormessage) throw new Error(msgResult.errormessage)

          await db.from('bulk_message_recipients').update({
            status: 'sent',
            sent_at: new Date().toISOString(),
          }).eq('id', r.id)

          sentCount++
        } catch (err) {
          console.error(`Failed to send to ${r.student_name}:`, err)
          await db.from('bulk_message_recipients').update({
            status: 'failed',
            error_message: err instanceof Error ? err.message : 'Unknown error',
          }).eq('id', r.id)

          failedCount++
        }
      })
    )

    // Update job progress
    await db.from('bulk_message_jobs').update({
      sent_count: sentCount,
      failed_count: failedCount,
    }).eq('id', job_id)

    // Delay between batches
    if (i + BATCH_SIZE < recipients.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS))
    }
  }

  // Mark complete
  const finalStatus = failedCount === recipients.length ? 'failed' : 'completed'
  await db.from('bulk_message_jobs').update({
    status: finalStatus,
    sent_count: sentCount,
    failed_count: failedCount,
    completed_at: new Date().toISOString(),
  }).eq('id', job_id)

  return jsonResponse({ success: true, sent: sentCount, failed: failedCount })
}, { requireAuth: true }))
