// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { createHandler, errorResponse, jsonResponse } from '../_shared/http/mod.ts'
import type { AuthenticatedHandlerContext } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import {
  createJobWithRecipients,
  failJob,
  finalizeJob,
  findDuplicateActiveJob,
  findJobForUser,
  listPendingRecipients,
  markJobProcessing,
  markJobProgress,
  markRecipientFailed,
  markRecipientSent,
} from '../_shared/domain/bulk-messaging/repository.ts'
import type { BulkMessageJob } from '../_shared/domain/bulk-messaging/repository.ts'
import { findUserById } from '../_shared/domain/users/repository.ts'
import { callMoodleApi } from '../_shared/moodle/mod.ts'
import { parseBulkMessageSendPayload } from './payload.ts'
import type { BulkMessageSendPayload } from './payload.ts'

const BATCH_SIZE = 5
const DELAY_BETWEEN_BATCHES_MS = 1000

async function notifyBulkMessageResult(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  payload: {
    jobId: string
    status: 'completed' | 'failed'
    sentCount: number
    failedCount: number
    totalRecipients: number
  },
) {
  const title = payload.status === 'completed'
    ? 'Envio em massa concluÃ­do'
    : 'Envio em massa finalizado com falhas'

  const description = payload.status === 'completed'
    ? `Foram enviadas ${payload.sentCount} de ${payload.totalRecipients} mensagens.`
    : `Envio concluÃ­do com ${payload.sentCount} sucessos e ${payload.failedCount} falhas.`

  await db.from('activity_feed').insert({
    user_id: userId,
    event_type: 'bulk_message_job',
    title,
    description,
    metadata: {
      job_id: payload.jobId,
      status: payload.status,
      sent_count: payload.sentCount,
      failed_count: payload.failedCount,
      total_recipients: payload.totalRecipients,
    },
  })
}

async function processBulkMessageJob(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  job: BulkMessageJob,
  moodleUrl: string,
  token: string,
) {
  let sentCount = job.sent_count || 0
  let failedCount = job.failed_count || 0

  try {
    await markJobProcessing(db, job.id, new Date().toISOString())

    const recipients = await listPendingRecipients(db, job.id)

    if (recipients.length === 0) {
      await finalizeJob(db, job.id, 'completed', sentCount, failedCount, new Date().toISOString())
      await notifyBulkMessageResult(db, userId, {
        jobId: job.id,
        status: 'completed',
        sentCount,
        failedCount,
        totalRecipients: job.total_recipients,
      })

      return {
        failed: failedCount,
        jobId: job.id,
        sent: sentCount,
        status: 'completed' as const,
      }
    }

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE)

      await Promise.allSettled(
        batch.map(async (recipient) => {
          try {
            const result = await callMoodleApi(moodleUrl, token, 'core_message_send_instant_messages', {
              'messages[0][touserid]': Number(recipient.moodle_user_id),
              'messages[0][text]': recipient.personalized_message || job.message_content,
              'messages[0][textformat]': 0,
            })

            const messageResult = Array.isArray(result) ? result[0] : result
            if (messageResult?.errormessage) throw new Error(messageResult.errormessage)

            await markRecipientSent(db, recipient.id, new Date().toISOString())
            sentCount++
          } catch (error) {
            console.error(`Failed to send to ${recipient.student_name}:`, error)

            await markRecipientFailed(
              db,
              recipient.id,
              error instanceof Error ? error.message : 'Unknown error',
            )

            failedCount++
          }
        }),
      )

      await markJobProgress(db, job.id, sentCount, failedCount)

      if (i + BATCH_SIZE < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS))
      }
    }

    const finalStatus = failedCount === recipients.length ? 'failed' : 'completed'

    await finalizeJob(db, job.id, finalStatus, sentCount, failedCount, new Date().toISOString())
    await notifyBulkMessageResult(db, userId, {
      jobId: job.id,
      status: finalStatus,
      sentCount,
      failedCount,
      totalRecipients: recipients.length,
    })

    return {
      failed: failedCount,
      jobId: job.id,
      sent: sentCount,
      status: finalStatus,
    }
  } catch (error) {
    await failJob(
      db,
      job.id,
      error instanceof Error ? error.message : 'Falha inesperada ao processar envio em massa',
      new Date().toISOString(),
    )

    throw error
  }
}

const handleBulkMessageSend = async ({ body, user }: AuthenticatedHandlerContext<BulkMessageSendPayload>) => {
  const userId = user.id
  const db = createServiceClient()

  const userData = await findUserById(db, userId)
  if (!userData) return errorResponse('User not found')

  if (body.mode === 'create') {
    const messageContent = body.messageContent.trim()
    if (!messageContent) return errorResponse('message_content is required')

    const duplicateJob = await findDuplicateActiveJob(
      db,
      userId,
      messageContent,
      body.recipients.length,
    )

    if (duplicateJob) {
      return jsonResponse({
        jobId: duplicateJob.id,
        kind: 'duplicate',
      })
    }

    const job = await createJobWithRecipients(db, {
      messageContent,
      origin: body.origin,
      recipients: body.recipients,
      templateId: body.templateId,
      userId,
    })

    const result = await processBulkMessageJob(db, userId, job, body.moodleUrl, body.token)

    return jsonResponse({
      ...result,
      kind: 'started',
    })
  }

  const job = await findJobForUser(db, body.jobId, userId)

  if (!job) return errorResponse('Job not found')
  if (job.status !== 'pending') return errorResponse(`Job status is ${job.status}, expected pending`)

  const result = await processBulkMessageJob(db, userId, job, body.moodleUrl, body.token)

  return jsonResponse({
    ...result,
    success: true,
  })
}

Deno.serve(createHandler(handleBulkMessageSend, { requireAuth: true, parseBody: parseBulkMessageSendPayload }))
