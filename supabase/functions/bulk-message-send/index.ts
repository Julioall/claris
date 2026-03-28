// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { createHandler, errorResponse, jsonResponse } from '../_shared/http/mod.ts'
import type { AuthenticatedHandlerContext } from '../_shared/http/mod.ts'
import { userHasPermission } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import {
  createJobWithRecipients,
  findDuplicateActiveJob,
  findJobForUser,
} from '../_shared/domain/bulk-messaging/repository.ts'
import { processBulkMessageJob } from '../_shared/domain/bulk-messaging/service.ts'
import { findUserById } from '../_shared/domain/users/repository.ts'
import { parseBulkMessageSendPayload } from './payload.ts'
import type { BulkMessageSendPayload } from './payload.ts'

const handleBulkMessageSend = async ({ body, user }: AuthenticatedHandlerContext<BulkMessageSendPayload>) => {
  const userId = user.id
  const db = createServiceClient()

  const canSendBulkMessages = await userHasPermission(db, userId, 'messages.bulk_send')
  if (!canSendBulkMessages) {
    return errorResponse('Permission denied for bulk messaging.', 403)
  }

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
