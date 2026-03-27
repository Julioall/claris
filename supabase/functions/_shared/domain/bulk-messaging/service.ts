import { createServiceClient } from '../../db/mod.ts'
import { callMoodleApi } from '../../moodle/mod.ts'
import type { BulkMessageJob } from './repository.ts'
import {
  failJob,
  finalizeJob,
  listPendingRecipients,
  markJobProcessing,
  markJobProgress,
  markRecipientFailed,
  markRecipientSent,
} from './repository.ts'

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
    ? 'Envio em massa concluido'
    : 'Envio em massa finalizado com falhas'

  const description = payload.status === 'completed'
    ? `Foram enviadas ${payload.sentCount} de ${payload.totalRecipients} mensagens.`
    : `Envio concluido com ${payload.sentCount} sucessos e ${payload.failedCount} falhas.`

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

export interface ProcessBulkMessageJobResult {
  failed: number
  jobId: string
  sent: number
  status: 'completed' | 'failed'
}

export async function processBulkMessageJob(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  job: BulkMessageJob,
  moodleUrl: string,
  token: string,
): Promise<ProcessBulkMessageJobResult> {
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
        status: 'completed',
      }
    }

    for (let index = 0; index < recipients.length; index += BATCH_SIZE) {
      const batch = recipients.slice(index, index + BATCH_SIZE)

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
            sentCount += 1
          } catch (error) {
            console.error(`Failed to send to ${recipient.student_name}:`, error)

            await markRecipientFailed(
              db,
              recipient.id,
              error instanceof Error ? error.message : 'Unknown error',
            )

            failedCount += 1
          }
        }),
      )

      await markJobProgress(db, job.id, sentCount, failedCount)

      if (index + BATCH_SIZE < recipients.length) {
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
