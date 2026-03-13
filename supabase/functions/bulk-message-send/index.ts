// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { createHandler, errorResponse, jsonResponse } from '../_shared/http/mod.ts'
import type { AuthenticatedHandlerContext } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import {
  finalizeJob,
  findJobForUser,
  listPendingRecipients,
  markJobProcessing,
  markJobProgress,
  markRecipientFailed,
  markRecipientSent,
} from '../_shared/domain/bulk-messaging/repository.ts'
import { findUserById } from '../_shared/domain/users/repository.ts'
import { callMoodleApi } from '../_shared/moodle/mod.ts'
import { parseBulkMessageSendPayload } from './payload.ts'
import type { BulkMessageSendPayload } from './payload.ts'

const BATCH_SIZE = 5
const DELAY_BETWEEN_BATCHES_MS = 1000

const handleBulkMessageSend = async ({ body, user }: AuthenticatedHandlerContext<BulkMessageSendPayload>) => {
  const userId = user.id
  const { jobId, moodleUrl, token } = body

  const db = createServiceClient()

  // Get job
  const job = await findJobForUser(db, jobId, userId)

  if (!job) return errorResponse('Job not found')
  if (job.status !== 'pending') return errorResponse(`Job status is ${job.status}, expected pending`)

  // Get user's moodle credentials
  const userData = await findUserById(db, userId)

  if (!userData) return errorResponse('User not found')

  // Mark as processing
  await markJobProcessing(db, jobId, new Date().toISOString())

  // Get pending recipients
  const recipients = await listPendingRecipients(db, jobId)

  if (!recipients || recipients.length === 0) {
    await finalizeJob(db, jobId, 'completed', 0, 0, new Date().toISOString())
    return jsonResponse({ success: true, sent: 0 })
  }

  let sentCount = job.sent_count || 0
  let failedCount = job.failed_count || 0

  // Process in batches
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(async (r: { id: string; moodle_user_id: string; personalized_message?: string; student_name?: string }) => {
        try {
          const result = await callMoodleApi(moodleUrl, token, 'core_message_send_instant_messages', {
            'messages[0][touserid]': Number(r.moodle_user_id),
            'messages[0][text]': r.personalized_message || job.message_content,
            'messages[0][textformat]': 0,
          })

          const msgResult = Array.isArray(result) ? result[0] : result
          if (msgResult?.errormessage) throw new Error(msgResult.errormessage)

          await markRecipientSent(db, r.id, new Date().toISOString())

          sentCount++
        } catch (err) {
          console.error(`Failed to send to ${r.student_name}:`, err)
          await markRecipientFailed(db, r.id, err instanceof Error ? err.message : 'Unknown error')

          failedCount++
        }
      })
    )

    // Update job progress
    await markJobProgress(db, jobId, sentCount, failedCount)

    // Delay between batches
    if (i + BATCH_SIZE < recipients.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS))
    }
  }

  // Mark complete
  const finalStatus = failedCount === recipients.length ? 'failed' : 'completed'
  await finalizeJob(db, jobId, finalStatus, sentCount, failedCount, new Date().toISOString())

  return jsonResponse({ success: true, sent: sentCount, failed: failedCount })
}

Deno.serve(createHandler(handleBulkMessageSend, { requireAuth: true, parseBody: parseBulkMessageSendPayload }))
