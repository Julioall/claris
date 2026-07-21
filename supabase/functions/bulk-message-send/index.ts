// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import {
  ApiError,
  apiSuccessResponse,
  createHandler,
} from '../_shared/http/mod.ts'
import { userHasPermission } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { resolveAuthorizedRecipients } from '../_shared/domain/bulk-messaging/audience.ts'
import {
  createJobWithRecipients,
  findDuplicateActiveJob,
  findJobForUser,
} from '../_shared/domain/bulk-messaging/repository.ts'
import { processBulkMessageJob } from '../_shared/domain/bulk-messaging/service.ts'
import {
  BULK_MESSAGE_SEND_CONTRACT_VERSION,
  type BulkMessageSendMetadataDto,
  type BulkMessageSendResultDto,
} from './contract.ts'
import { parseBulkMessageSendPayload } from './payload.ts'

const db = createServiceClient()
const BULK_SEND_PERMISSION = 'messages.bulk_send'

function metadata(): BulkMessageSendMetadataDto {
  return {
    contractVersion: BULK_MESSAGE_SEND_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
  }
}

async function assertOwnedTemplate(actorId: string, templateId: string | undefined): Promise<void> {
  if (!templateId) return
  const { data, error } = await db
    .from('message_templates')
    .select('id')
    .eq('id', templateId)
    .eq('user_id', actorId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw ApiError.notFound('Message template not found')
}

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  let result: BulkMessageSendResultDto

  if (body.action === 'start_send') {
    await assertOwnedTemplate(user.id, body.templateId)
    const recipients = await resolveAuthorizedRecipients(db, user.id, body.recipients)
    const duplicate = await findDuplicateActiveJob(
      db,
      user.id,
      body.messageContent,
      recipients.length,
    )
    if (duplicate) {
      result = { jobId: duplicate.id, kind: 'duplicate', metadata: metadata() }
    } else {
      const job = await createJobWithRecipients(db, {
        messageContent: body.messageContent,
        origin: body.origin,
        recipients,
        templateId: body.templateId,
        userId: user.id,
      })
      const processed = await processBulkMessageJob(db, user.id, job, body.moodleUrl, body.token)
      result = { ...processed, kind: 'started', metadata: metadata() }
    }
  } else {
    const job = await findJobForUser(db, body.jobId, user.id)
    if (!job) throw ApiError.notFound('Bulk message job not found')
    if (job.status !== 'pending') {
      throw ApiError.conflict('Bulk message job cannot be resumed from its current status', {
        status: job.status,
      })
    }
    const processed = await processBulkMessageJob(db, user.id, job, body.moodleUrl, body.token)
    result = { ...processed, kind: 'resumed', metadata: metadata() }
  }

  return apiSuccessResponse(result, correlationId)
}, {
  authorize: ({ user }) => userHasPermission(db, user.id, BULK_SEND_PERMISSION),
  maxBodyBytes: 16 * 1024 * 1024,
  parseBody: parseBulkMessageSendPayload,
  requireAuth: true,
}))
