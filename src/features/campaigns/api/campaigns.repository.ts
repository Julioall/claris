import { ApiClientError, invokeEdgeFunction } from '@/integrations/http/edge-function-client';

import type {
  BulkJobDetail,
  BulkJobListFilters,
  BulkJobListItem,
  BulkJobRecipient,
  PaginatedBulkJobs,
  PaginatedScheduledMessages,
  ScheduledMessage,
  ScheduledMessageExecutionContext,
  ScheduledMessageFormValues,
  ScheduledMessageListFilters,
} from '../types';
import {
  CAMPAIGNS_CONTRACT_VERSION,
  type BulkJobDetailDto,
  type BulkJobDto,
  type BulkJobRecipientDto,
  type BulkJobRecipientsPageDto,
  type BulkJobsPageDto,
  type CampaignsMetadataDto,
  type ScheduledMessageDeleteDto,
  type ScheduledMessageDto,
  type ScheduledMessageMutationDto,
  type ScheduledMessagesPageDto,
} from './contracts/campaigns.contract';
import {
  mapBulkJob,
  mapBulkJobRecipient,
  mapScheduledMessage,
} from './mappers/campaigns.mapper';

const DEFAULT_PAGE_SIZE = 30;
const CAMPAIGNS_TIMEOUT_MS = 20_000;
const BULK_JOB_STATUSES = new Set(['pending', 'processing', 'completed', 'failed', 'cancelled']);
const SCHEDULED_STATUSES = new Set(['pending', 'paused', 'processing', 'sent', 'failed', 'cancelled']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function invalidResponse(): never {
  throw new ApiClientError({
    code: 'invalid_response',
    message: 'A API de campanhas retornou uma resposta invalida.',
  });
}

function isMetadata(value: unknown): value is CampaignsMetadataDto {
  const metadata = asRecord(value);
  return Boolean(
    metadata
    && metadata.contractVersion === CAMPAIGNS_CONTRACT_VERSION
    && typeof metadata.generatedAt === 'string',
  );
}

function isBulkJob(value: unknown): value is BulkJobDto {
  const job = asRecord(value);
  return Boolean(
    job
    && typeof job.id === 'string'
    && typeof job.messageContent === 'string'
    && nonNegativeInteger(job.totalRecipients)
    && nonNegativeInteger(job.sentCount)
    && nonNegativeInteger(job.failedCount)
    && typeof job.status === 'string'
    && BULK_JOB_STATUSES.has(job.status)
    && (job.origin === 'manual' || job.origin === 'ia')
    && typeof job.createdAt === 'string'
    && nullableString(job.startedAt)
    && nullableString(job.completedAt)
    && nullableString(job.errorMessage)
    && nullableString(job.templateId),
  );
}

function isRecipient(value: unknown): value is BulkJobRecipientDto {
  const recipient = asRecord(value);
  return Boolean(
    recipient
    && typeof recipient.id === 'string'
    && typeof recipient.studentName === 'string'
    && typeof recipient.moodleUserId === 'string'
    && ['pending', 'sent', 'failed'].includes(String(recipient.status))
    && nullableString(recipient.personalizedMessage)
    && nullableString(recipient.sentAt)
    && nullableString(recipient.errorMessage),
  );
}

function isScheduledMessage(value: unknown): value is ScheduledMessageDto {
  const message = asRecord(value);
  return Boolean(
    message
    && typeof message.id === 'string'
    && typeof message.title === 'string'
    && typeof message.messageContent === 'string'
    && nullableString(message.templateId)
    && typeof message.scheduledAt === 'string'
    && typeof message.status === 'string'
    && SCHEDULED_STATUSES.has(message.status)
    && (message.origin === 'manual' || message.origin === 'ia')
    && (message.channel === 'moodle' || message.channel === 'whatsapp')
    && (message.recipientCount === null || nonNegativeInteger(message.recipientCount))
    && nonNegativeInteger(message.sentCount)
    && nonNegativeInteger(message.failedCount)
    && nullableString(message.notes)
    && typeof message.createdAt === 'string'
    && nullableString(message.errorMessage)
    && asRecord(message.executionContext)
    && (message.resultContext === null || asRecord(message.resultContext))
    && nullableString(message.executedBulkJobId)
    && nonNegativeInteger(message.executionAttempts)
    && nullableString(message.lastExecutionAt)
    && nullableString(message.startedAt)
    && nullableString(message.completedAt)
    && typeof message.updatedAt === 'string'
    && nullableString(message.whatsappInstanceId),
  );
}

function parsePage<T>(value: unknown, isItem: (item: unknown) => item is T): {
  items: T[];
  metadata: CampaignsMetadataDto;
  totalCount: number;
} {
  const page = asRecord(value);
  if (!(
    page
    && Array.isArray(page.items)
    && page.items.every(isItem)
    && nonNegativeInteger(page.page)
    && nonNegativeInteger(page.pageSize)
    && nonNegativeInteger(page.totalCount)
    && nonNegativeInteger(page.totalPages)
    && isMetadata(page.metadata)
  )) invalidResponse();
  return page as unknown as { items: T[]; metadata: CampaignsMetadataDto; totalCount: number };
}

function parseBulkJobsPage(value: unknown): BulkJobsPageDto {
  return parsePage(value, isBulkJob) as BulkJobsPageDto;
}

function parseRecipientsPage(value: unknown): BulkJobRecipientsPageDto {
  return parsePage(value, isRecipient) as BulkJobRecipientsPageDto;
}

function parseScheduledPage(value: unknown): ScheduledMessagesPageDto {
  return parsePage(value, isScheduledMessage) as ScheduledMessagesPageDto;
}

function parseJobDetail(value: unknown): BulkJobDetailDto {
  const detail = asRecord(value);
  if (!(detail && isBulkJob(detail.job) && isMetadata(detail.metadata))) invalidResponse();
  return detail as unknown as BulkJobDetailDto;
}

function parseScheduledMutation(value: unknown): ScheduledMessageMutationDto {
  const mutation = asRecord(value);
  if (!(mutation && isScheduledMessage(mutation.message) && isMetadata(mutation.metadata))) invalidResponse();
  return mutation as unknown as ScheduledMessageMutationDto;
}

function parseDelete(value: unknown): ScheduledMessageDeleteDto {
  const deletion = asRecord(value);
  if (!(deletion && deletion.deleted === true && isMetadata(deletion.metadata))) invalidResponse();
  return deletion as unknown as ScheduledMessageDeleteDto;
}

function invoke(body: Record<string, unknown>): Promise<unknown> {
  return invokeEdgeFunction('campaigns', {
    auth: 'required',
    body,
    timeoutMs: CAMPAIGNS_TIMEOUT_MS,
  });
}

function normalizedPage(value = 1): number {
  return Math.max(1, value);
}

function normalizedPageSize(value = DEFAULT_PAGE_SIZE): number {
  return Math.min(1_000, Math.max(1, value));
}

function statusesFromFilter(status: string | undefined, allowed: Set<string>): string[] | undefined {
  if (!status || status === 'all') return undefined;
  if (!allowed.has(status)) throw new Error(`Status de filtro invalido: ${status}`);
  return [status];
}

async function listBulkJobsByStatuses(
  filters: BulkJobListFilters,
  statuses?: string[],
): Promise<PaginatedBulkJobs> {
  const page = normalizedPage(filters.page);
  const pageSize = normalizedPageSize(filters.pageSize);
  const response = parseBulkJobsPage(await invoke({
    action: 'list_bulk_jobs',
    filters: {
      ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
      ...(statuses?.length ? { statuses } : {}),
    },
    order: 'createdAtDesc',
    page,
    pageSize,
  }));
  return { items: response.items.map(mapBulkJob), totalCount: response.totalCount };
}

export async function listBulkJobs(filters: BulkJobListFilters = {}): Promise<PaginatedBulkJobs> {
  return listBulkJobsByStatuses(filters, statusesFromFilter(filters.status, BULK_JOB_STATUSES));
}

export async function listRecentBulkJobs(limit = 5): Promise<BulkJobListItem[]> {
  return (await listBulkJobsByStatuses({ page: 1, pageSize: limit })).items;
}

export async function listActiveBulkJobs(): Promise<BulkJobListItem[]> {
  return (await listBulkJobsByStatuses(
    { page: 1, pageSize: 1_000 },
    ['pending', 'processing'],
  )).items;
}

export async function getBulkJobDetail(jobId: string): Promise<BulkJobDetail> {
  return mapBulkJob(parseJobDetail(await invoke({ action: 'get_bulk_job_detail', jobId })).job);
}

export async function listBulkJobRecipients(jobId: string): Promise<BulkJobRecipient[]> {
  const response = parseRecipientsPage(await invoke({
    action: 'list_bulk_job_recipients',
    jobId,
    order: 'studentNameAsc',
    page: 1,
    pageSize: 1_000,
  }));
  return response.items.map(mapBulkJobRecipient);
}

export async function listScheduledMessages(
  filters: ScheduledMessageListFilters = {},
): Promise<PaginatedScheduledMessages> {
  const page = normalizedPage(filters.page);
  const pageSize = normalizedPageSize(filters.pageSize);
  const statuses = statusesFromFilter(filters.status, SCHEDULED_STATUSES);
  const response = parseScheduledPage(await invoke({
    action: 'list_scheduled_messages',
    filters: {
      ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
      ...(statuses ? { statuses } : {}),
    },
    order: 'scheduledAtAsc',
    page,
    pageSize,
  }));
  return { items: response.items.map(mapScheduledMessage), totalCount: response.totalCount };
}

function readSchedule(context: ScheduledMessageExecutionContext | undefined) {
  const rawSchedule = context?.schedule;
  const schedule = asRecord(rawSchedule) ?? {};
  const type = ['specific_date', 'daily', 'weekly', 'biweekly', 'monthly'].includes(String(schedule.type))
    ? String(schedule.type)
    : 'specific_date';
  return {
    type,
    ...(typeof schedule.start_date === 'string' ? { startDate: schedule.start_date } : {}),
    ...(typeof schedule.end_date === 'string' ? { endDate: schedule.end_date } : {}),
    ...(typeof schedule.time === 'string' ? { time: schedule.time } : {}),
    ...(typeof schedule.weekday === 'number' ? { weekday: schedule.weekday } : {}),
    ...(typeof schedule.monthly_day === 'number' ? { monthlyDay: schedule.monthly_day } : {}),
  };
}

function scheduledInput(values: ScheduledMessageFormValues) {
  const snapshot = Array.isArray(values.execution_context?.recipient_snapshot)
    ? values.execution_context.recipient_snapshot
    : [];
  return {
    channel: values.channel,
    messageContent: values.message_content,
    ...(values.execution_context?.moodle_connection_id
      ? { moodleConnectionId: values.execution_context.moodle_connection_id }
      : {}),
    ...(values.notes?.trim() ? { notes: values.notes.trim() } : {}),
    schedule: readSchedule(values.execution_context),
    scheduledAt: new Date(values.scheduled_at).toISOString(),
    selectedRecipients: snapshot.map((recipient) => ({
      studentId: recipient.student_id,
      ...(recipient.personalized_message
        ? { personalizedMessage: recipient.personalized_message }
        : {}),
    })),
    ...(values.template_id ? { templateId: values.template_id } : {}),
    title: values.title,
    ...(values.whatsapp_instance_id ? { whatsappInstanceId: values.whatsapp_instance_id } : {}),
  };
}

export async function createScheduledMessage(values: ScheduledMessageFormValues): Promise<ScheduledMessage> {
  const response = parseScheduledMutation(await invoke({
    action: 'create_scheduled_message',
    input: scheduledInput(values),
  }));
  return mapScheduledMessage(response.message);
}

export async function updateScheduledMessage(
  id: string,
  values: ScheduledMessageFormValues,
): Promise<ScheduledMessage> {
  const response = parseScheduledMutation(await invoke({
    action: 'update_scheduled_message',
    input: scheduledInput(values),
    messageId: id,
  }));
  return mapScheduledMessage(response.message);
}

async function transitionScheduledMessage(
  id: string,
  transition: 'pause' | 'resume' | 'cancel',
): Promise<ScheduledMessage> {
  const response = parseScheduledMutation(await invoke({
    action: 'transition_scheduled_message',
    messageId: id,
    transition,
  }));
  return mapScheduledMessage(response.message);
}

export function cancelScheduledMessage(id: string): Promise<ScheduledMessage> {
  return transitionScheduledMessage(id, 'cancel');
}

export function pauseScheduledMessage(id: string): Promise<ScheduledMessage> {
  return transitionScheduledMessage(id, 'pause');
}

export function startScheduledMessage(id: string): Promise<ScheduledMessage> {
  return transitionScheduledMessage(id, 'resume');
}

export async function deleteScheduledMessage(id: string): Promise<void> {
  parseDelete(await invoke({ action: 'delete_scheduled_message', messageId: id }));
}
