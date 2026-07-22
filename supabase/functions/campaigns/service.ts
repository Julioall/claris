import { ApiError } from '../_shared/http/mod.ts'
import type { Json } from '../_shared/db/mod.ts'
import {
  CAMPAIGNS_CONTRACT_VERSION,
  type BulkJobDetailDto,
  type BulkJobRecipientsPageDto,
  type BulkJobsPageDto,
  type CampaignsMetadataDto,
  type ScheduledMessageDeleteDto,
  type ScheduledMessageMutationDto,
  type ScheduledMessagesPageDto,
  type ScheduledMessageStatusDto,
} from './contract.ts'
import type {
  CampaignsPayload,
  CampaignScheduleInput,
  ScheduledMessageInput,
} from './payload.ts'
import type {
  CampaignsRepository,
  ScheduledMessageWriteRecord,
} from './repository.ts'

export const CAMPAIGNS_PERMISSION = 'messages.bulk_send'

function metadata(): CampaignsMetadataDto {
  return {
    contractVersion: CAMPAIGNS_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
  }
}

function scheduleJson(schedule: CampaignScheduleInput): Record<string, unknown> {
  return {
    type: schedule.type,
    ...(schedule.endDate ? { end_date: schedule.endDate } : {}),
    ...(schedule.monthlyDay !== undefined ? { monthly_day: schedule.monthlyDay } : {}),
    ...(schedule.startDate ? { start_date: schedule.startDate } : {}),
    ...(schedule.time ? { time: schedule.time } : {}),
    ...(schedule.weekday !== undefined ? { weekday: schedule.weekday } : {}),
  }
}

async function assertOwnedTemplate(
  repository: CampaignsRepository,
  actorId: string,
  templateId: string | undefined,
): Promise<void> {
  if (templateId && !await repository.isTemplateOwned(actorId, templateId)) {
    throw ApiError.notFound('Message template not found')
  }
}

async function buildScheduledMessageWrite(
  repository: CampaignsRepository,
  actorId: string,
  input: ScheduledMessageInput,
): Promise<ScheduledMessageWriteRecord> {
  await assertOwnedTemplate(repository, actorId, input.templateId)

  if (input.channel === 'moodle') {
    if (!input.moodleConnectionId || input.selectedRecipients.length === 0) {
      throw ApiError.unprocessable('Moodle campaigns require a connection and at least one recipient')
    }
    const scope = await repository.resolveMoodleScope(actorId, input.moodleConnectionId)
    if (!scope) throw ApiError.forbidden('Moodle connection is not available to this user.')
    const recipients = await repository.resolveRecipients(
      actorId,
      scope.moodleSiteId,
      input.selectedRecipients,
    )
    return {
      executionContext: {
        automatic_execution_supported: true,
        channel: 'moodle',
        created_via: 'campaigns_v1',
        mode: 'bulk_message_snapshot',
        moodle_connection_id: scope.connectionId,
        recipient_snapshot: recipients.map((recipient) => ({
          moodle_user_id: recipient.moodleUserId,
          personalized_message: recipient.personalizedMessage ?? null,
          student_id: recipient.studentId,
          student_name: recipient.studentName,
        })),
        schedule: scheduleJson(input.schedule),
        schema_version: 4,
      } as Json,
      filterContext: { channel: 'moodle', whatsapp_instance_id: null },
      messageContent: input.messageContent,
      notes: input.notes ?? null,
      recipientCount: recipients.length,
      scheduledAt: input.scheduledAt,
      templateId: input.templateId ?? null,
      title: input.title,
    }
  }

  if (!input.whatsappInstanceId
    || !await repository.isWhatsappInstanceAccessible(actorId, input.whatsappInstanceId)) {
    throw ApiError.notFound('WhatsApp instance not found')
  }
  if (input.selectedRecipients.length > 0) {
    throw ApiError.unprocessable('WhatsApp campaign recipients must be resolved by the WhatsApp destination flow')
  }

  return {
    executionContext: {
      automatic_execution_supported: false,
      blocking_reason: 'destination_snapshot_missing',
      channel: 'whatsapp',
      created_via: 'campaigns_v1',
      mode: 'legacy_placeholder',
      schedule: scheduleJson(input.schedule),
      schema_version: 3,
      whatsapp_instance_id: input.whatsappInstanceId,
    } as Json,
    filterContext: {
      channel: 'whatsapp',
      whatsapp_instance_id: input.whatsappInstanceId,
    },
    messageContent: input.messageContent,
    notes: input.notes ?? null,
    recipientCount: null,
    scheduledAt: input.scheduledAt,
    templateId: input.templateId ?? null,
    title: input.title,
  }
}

export function authorizeCampaigns(
  repository: CampaignsRepository,
  actorId: string,
  _payload: CampaignsPayload,
): Promise<boolean> {
  return repository.userHasPermission(actorId, CAMPAIGNS_PERMISSION)
}

export async function executeCampaigns(
  repository: CampaignsRepository,
  actorId: string,
  payload: CampaignsPayload,
): Promise<
  | BulkJobsPageDto
  | BulkJobDetailDto
  | BulkJobRecipientsPageDto
  | ScheduledMessagesPageDto
  | ScheduledMessageMutationDto
  | ScheduledMessageDeleteDto
> {
  switch (payload.action) {
    case 'list_bulk_jobs': {
      const page = await repository.listBulkJobs({
        actorId,
        limit: payload.pageSize,
        offset: (payload.page - 1) * payload.pageSize,
        search: payload.filters.search,
        statuses: payload.filters.statuses,
      })
      return {
        items: page.items,
        metadata: metadata(),
        page: payload.page,
        pageSize: payload.pageSize,
        totalCount: page.totalCount,
        totalPages: Math.ceil(page.totalCount / payload.pageSize),
      }
    }
    case 'get_bulk_job_detail': {
      const job = await repository.findBulkJob(actorId, payload.jobId)
      if (!job) throw ApiError.notFound('Bulk message job not found')
      return { job, metadata: metadata() }
    }
    case 'list_bulk_job_recipients': {
      const job = await repository.findBulkJob(actorId, payload.jobId)
      if (!job) throw ApiError.notFound('Bulk message job not found')
      const page = await repository.listBulkJobRecipients({
        jobId: payload.jobId,
        limit: payload.pageSize,
        offset: (payload.page - 1) * payload.pageSize,
      })
      return {
        items: page.items,
        metadata: metadata(),
        page: payload.page,
        pageSize: payload.pageSize,
        totalCount: page.totalCount,
        totalPages: Math.ceil(page.totalCount / payload.pageSize),
      }
    }
    case 'list_scheduled_messages': {
      const page = await repository.listScheduledMessages({
        actorId,
        limit: payload.pageSize,
        offset: (payload.page - 1) * payload.pageSize,
        search: payload.filters.search,
        statuses: payload.filters.statuses,
      })
      return {
        items: page.items,
        metadata: metadata(),
        page: payload.page,
        pageSize: payload.pageSize,
        totalCount: page.totalCount,
        totalPages: Math.ceil(page.totalCount / payload.pageSize),
      }
    }
    case 'create_scheduled_message': {
      const input = await buildScheduledMessageWrite(repository, actorId, payload.input)
      const message = await repository.createScheduledMessage(actorId, input)
      return { message, metadata: metadata() }
    }
    case 'update_scheduled_message': {
      const current = await repository.findScheduledMessage(actorId, payload.messageId)
      if (!current) throw ApiError.notFound('Scheduled message not found')
      if (!['pending', 'paused'].includes(current.status)) {
        throw ApiError.conflict('Scheduled message cannot be edited from its current status', {
          status: current.status,
        })
      }
      const input = await buildScheduledMessageWrite(repository, actorId, payload.input)
      const message = await repository.updateScheduledMessage(actorId, payload.messageId, input)
      if (!message) throw ApiError.conflict('Scheduled message changed while it was being edited')
      return { message, metadata: metadata() }
    }
    case 'transition_scheduled_message': {
      const current = await repository.findScheduledMessage(actorId, payload.messageId)
      if (!current) throw ApiError.notFound('Scheduled message not found')
      const allowed: Record<typeof payload.transition, {
        from: ScheduledMessageStatusDto[]
        to: ScheduledMessageStatusDto
      }> = {
        cancel: { from: ['pending', 'paused'], to: 'cancelled' },
        pause: { from: ['pending'], to: 'paused' },
        resume: { from: ['paused'], to: 'pending' },
      }
      const transition = allowed[payload.transition]
      if (!transition.from.includes(current.status)) {
        throw ApiError.conflict('Invalid scheduled message transition', {
          from: current.status,
          transition: payload.transition,
        })
      }
      const message = await repository.transitionScheduledMessage({
        actorId,
        expectedStatus: current.status,
        messageId: payload.messageId,
        nextStatus: transition.to,
        timestamp: new Date().toISOString(),
      })
      if (!message) throw ApiError.conflict('Scheduled message changed while transitioning')
      return { message, metadata: metadata() }
    }
    case 'delete_scheduled_message': {
      const current = await repository.findScheduledMessage(actorId, payload.messageId)
      if (!current) throw ApiError.notFound('Scheduled message not found')
      if (current.status === 'processing') {
        throw ApiError.conflict('A processing scheduled message cannot be deleted')
      }
      const deleted = await repository.deleteScheduledMessage(actorId, payload.messageId)
      if (!deleted) throw ApiError.conflict('Scheduled message changed while it was being deleted')
      return { deleted: true, metadata: metadata() }
    }
  }
}
