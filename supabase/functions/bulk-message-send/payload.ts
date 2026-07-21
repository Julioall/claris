import {
  RequestBodyValidationError,
  expectBodyObject,
  readRequiredMoodleUrl,
} from '../_shared/http/mod.ts'

export interface StartBulkMessageSendPayload {
  action: 'start_send'
  messageContent: string
  moodleUrl: string
  origin: 'manual'
  recipients: Array<{
    personalizedMessage?: string
    studentId: string
  }>
  templateId?: string
  token: string
}

export interface RetryBulkMessageSendPayload {
  action: 'retry_send'
  jobId: string
  moodleUrl: string
  token: string
}

export type BulkMessageSendPayload = StartBulkMessageSendPayload | RetryBulkMessageSendPayload

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_RECIPIENTS = 1_000

function invalid(field: string): never {
  throw new RequestBodyValidationError(`Invalid ${field}`, 422)
}

function exactFields(body: Record<string, unknown>, allowedFields: string[]) {
  const allowed = new Set(allowedFields)
  if (Object.keys(body).some((field) => !allowed.has(field))) invalid('request fields')
}

function requiredString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string') invalid(field)
  const parsed = value.trim()
  if (!parsed || parsed.length > maximum) invalid(field)
  return parsed
}

function optionalUuid(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) invalid(field)
  return value
}

function requiredUuid(value: unknown, field: string): string {
  return optionalUuid(value, field) ?? invalid(field)
}

function parseRecipients(value: unknown): StartBulkMessageSendPayload['recipients'] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_RECIPIENTS) invalid('recipients')
  return value.map((rawRecipient, index) => {
    if (!rawRecipient || typeof rawRecipient !== 'object' || Array.isArray(rawRecipient)) {
      invalid(`recipients[${index}]`)
    }
    const recipient = rawRecipient as Record<string, unknown>
    exactFields(recipient, ['personalizedMessage', 'studentId'])
    const personalizedMessage = recipient.personalizedMessage === undefined
      ? undefined
      : requiredString(recipient.personalizedMessage, `recipients[${index}].personalizedMessage`, 12_000)
    return {
      ...(personalizedMessage ? { personalizedMessage } : {}),
      studentId: requiredUuid(recipient.studentId, `recipients[${index}].studentId`),
    }
  })
}

export function parseBulkMessageSendPayload(rawBody: unknown): BulkMessageSendPayload {
  const body = expectBodyObject(rawBody)
  switch (body.action) {
    case 'start_send': {
      exactFields(body, ['action', 'messageContent', 'moodleUrl', 'origin', 'recipients', 'templateId', 'token'])
      if (body.origin !== undefined && body.origin !== 'manual') invalid('origin')
      return {
        action: 'start_send',
        messageContent: requiredString(body.messageContent, 'messageContent', 12_000),
        moodleUrl: readRequiredMoodleUrl(body),
        origin: 'manual',
        recipients: parseRecipients(body.recipients),
        templateId: optionalUuid(body.templateId, 'templateId'),
        token: requiredString(body.token, 'token', 12_000),
      }
    }
    case 'retry_send':
      exactFields(body, ['action', 'jobId', 'moodleUrl', 'token'])
      return {
        action: 'retry_send',
        jobId: requiredUuid(body.jobId, 'jobId'),
        moodleUrl: readRequiredMoodleUrl(body),
        token: requiredString(body.token, 'token', 12_000),
      }
    default:
      invalid('action')
  }
}
