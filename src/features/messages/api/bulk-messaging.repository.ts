import { ApiClientError, invokeEdgeFunction } from '@/integrations/http/edge-function-client';
import {
  listActiveBulkJobs,
  listRecentBulkJobs,
} from '@/features/campaigns/api/campaigns.repository';

import type {
  BulkMessageJobPreview,
  BulkMessageRecipientInput,
  BulkSendAudienceData,
} from '../types';
import {
  BULK_MESSAGE_AUDIENCE_CONTRACT_VERSION,
  BULK_MESSAGE_SEND_CONTRACT_VERSION,
  type BulkAudienceCourseDto,
  type BulkAudienceStudentDto,
  type BulkMessageAudienceDto,
  type BulkMessageSendResultDto,
  type BulkMessagingMetadataDto,
} from './contracts/bulk-messaging.contract';
import { mapBulkAudience } from './mappers/bulk-messaging.mapper';

interface StartBulkMessageSendInput {
  messageContent: string;
  moodleToken: string;
  moodleUrl: string;
  recipients: BulkMessageRecipientInput[];
}

export type StartBulkMessageSendResult =
  | { kind: 'duplicate'; jobId: string }
  | { kind: 'started'; jobId: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function invalidResponse(source: string): never {
  throw new ApiClientError({
    code: 'invalid_response',
    message: `A API de ${source} retornou uma resposta invalida.`,
  });
}

function isMetadata(value: unknown, version: number): value is BulkMessagingMetadataDto {
  const metadata = asRecord(value);
  return Boolean(
    metadata
    && metadata.contractVersion === version
    && typeof metadata.generatedAt === 'string',
  );
}

function isCourse(value: unknown): value is BulkAudienceCourseDto {
  const course = asRecord(value);
  return Boolean(
    course
    && typeof course.courseId === 'string'
    && typeof course.courseName === 'string'
    && nullableString(course.category)
    && nullableString(course.startDate)
    && nullableString(course.lastAccess)
    && typeof course.enrollmentStatus === 'string',
  );
}

function isStudent(value: unknown): value is BulkAudienceStudentDto {
  const student = asRecord(value);
  return Boolean(
    student
    && typeof student.id === 'string'
    && typeof student.fullName === 'string'
    && nullableString(student.email)
    && nullableString(student.avatarUrl)
    && typeof student.moodleUserId === 'string'
    && nullableString(student.currentRiskLevel)
    && nullableString(student.lastAccess)
    && typeof student.enrollmentStatus === 'string'
    && Array.isArray(student.courses)
    && student.courses.every(isCourse),
  );
}

function isLookup(value: unknown, grade: boolean): boolean {
  const lookup = asRecord(value);
  if (!lookup) return false;
  return Object.values(lookup).every((entry) => {
    if (!grade) return Number.isSafeInteger(entry) && (entry as number) >= 0;
    const item = asRecord(entry);
    return Boolean(
      item
      && nullableString(item.gradeFormatted)
      && (item.gradePercentage === null || typeof item.gradePercentage === 'number'),
    );
  });
}

function parseAudience(value: unknown): BulkMessageAudienceDto {
  const audience = asRecord(value);
  if (!(
    audience
    && Array.isArray(audience.students)
    && audience.students.every(isStudent)
    && isLookup(audience.gradeLookup, true)
    && isLookup(audience.pendingLookup, false)
    && isMetadata(audience.metadata, BULK_MESSAGE_AUDIENCE_CONTRACT_VERSION)
  )) invalidResponse('publico de mensagens');
  return audience as unknown as BulkMessageAudienceDto;
}

function parseSend(value: unknown): BulkMessageSendResultDto {
  const result = asRecord(value);
  if (!(
    result
    && typeof result.jobId === 'string'
    && ['duplicate', 'started', 'resumed'].includes(String(result.kind))
    && isMetadata(result.metadata, BULK_MESSAGE_SEND_CONTRACT_VERSION)
  )) invalidResponse('envio em massa');
  if (result.kind !== 'duplicate' && !(
    Number.isSafeInteger(result.sent)
    && Number.isSafeInteger(result.failed)
    && ['completed', 'failed'].includes(String(result.status))
  )) invalidResponse('envio em massa');
  return result as unknown as BulkMessageSendResultDto;
}

export function buildStudentCourseKey(studentId: string, courseId: string): string {
  return `${studentId}:${courseId}`;
}

export async function listBulkSendAudienceForUser(): Promise<BulkSendAudienceData> {
  const response = await invokeEdgeFunction<unknown>('bulk-message-audience', {
    auth: 'required',
    body: { action: 'get_audience' },
    timeoutMs: 20_000,
  });
  return mapBulkAudience(parseAudience(response));
}

export async function listRecentBulkMessageJobsForUser(
  limit = 5,
): Promise<BulkMessageJobPreview[]> {
  return listRecentBulkJobs(limit);
}

export async function listActiveBulkMessageJobsForUser(): Promise<BulkMessageJobPreview[]> {
  return listActiveBulkJobs();
}

export async function startBulkMessageSend(
  input: StartBulkMessageSendInput,
): Promise<StartBulkMessageSendResult> {
  if (input.recipients.length === 0) {
    throw new Error('Nenhum destinatario informado para o envio em massa');
  }
  const response = parseSend(await invokeEdgeFunction<unknown>('bulk-message-send', {
    auth: 'required',
    body: {
      action: 'start_send',
      messageContent: input.messageContent.trim(),
      moodleUrl: input.moodleUrl,
      origin: 'manual',
      recipients: input.recipients.map((recipient) => ({
        personalizedMessage: recipient.personalizedMessage,
        studentId: recipient.studentId,
      })),
      token: input.moodleToken,
    },
    timeoutMs: 120_000,
  }));
  return response.kind === 'duplicate'
    ? { jobId: response.jobId, kind: 'duplicate' }
    : { jobId: response.jobId, kind: 'started' };
}
