import type {
  BulkJobDto,
  BulkJobRecipientDto,
  ScheduledMessageDto,
} from '../contracts/campaigns.contract';
import type {
  BulkJobListItem,
  BulkJobRecipient,
  CampaignJson,
  ScheduledMessage,
  ScheduledMessageExecutionContext,
} from '../../types';

function snakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

function snakeCase(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snakeCase);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [snakeKey(key), snakeCase(entry)]),
  );
}

export function mapBulkJob(dto: BulkJobDto): BulkJobListItem {
  return {
    completed_at: dto.completedAt,
    created_at: dto.createdAt,
    error_message: dto.errorMessage,
    failed_count: dto.failedCount,
    id: dto.id,
    message_content: dto.messageContent,
    origin: dto.origin,
    sent_count: dto.sentCount,
    started_at: dto.startedAt,
    status: dto.status,
    template_id: dto.templateId,
    total_recipients: dto.totalRecipients,
  };
}

export function mapBulkJobRecipient(dto: BulkJobRecipientDto): BulkJobRecipient {
  return {
    error_message: dto.errorMessage,
    id: dto.id,
    moodle_user_id: dto.moodleUserId,
    personalized_message: dto.personalizedMessage,
    sent_at: dto.sentAt,
    status: dto.status,
    student_name: dto.studentName,
  };
}

export function mapScheduledMessage(dto: ScheduledMessageDto): ScheduledMessage {
  return {
    channel: dto.channel,
    created_at: dto.createdAt,
    error_message: dto.errorMessage,
    executed_bulk_job_id: dto.executedBulkJobId,
    execution_attempts: dto.executionAttempts,
    execution_context: snakeCase(dto.executionContext) as ScheduledMessageExecutionContext,
    failed_count: dto.failedCount,
    id: dto.id,
    last_execution_at: dto.lastExecutionAt,
    message_content: dto.messageContent,
    notes: dto.notes,
    origin: dto.origin,
    recipient_count: dto.recipientCount,
    result_context: dto.resultContext ? snakeCase(dto.resultContext) as CampaignJson : null,
    scheduled_at: dto.scheduledAt,
    sent_count: dto.sentCount,
    status: dto.status,
    template_id: dto.templateId,
    title: dto.title,
    whatsapp_instance_id: dto.whatsappInstanceId ?? undefined,
  };
}
