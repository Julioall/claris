import {
  RequestBodyValidationError,
  expectBodyObject,
  readOptionalLiteral,
  readOptionalString,
  readRequiredMoodleUrl,
  readRequiredString,
} from '../_shared/http/mod.ts'

type BulkMessageOrigin = 'manual' | 'ia'

export interface BulkMessageRecipientPayload {
  moodleUserId: string
  personalizedMessage?: string
  studentId: string
  studentName: string
}

interface ExistingBulkMessageSendPayload {
  jobId: string
  mode: 'existing'
  moodleUrl: string
  token: string
}

interface CreateBulkMessageSendPayload {
  messageContent: string
  mode: 'create'
  moodleUrl: string
  origin: BulkMessageOrigin
  recipients: BulkMessageRecipientPayload[]
  templateId?: string
  token: string
}

export type BulkMessageSendPayload =
  | ExistingBulkMessageSendPayload
  | CreateBulkMessageSendPayload

function readRecipients(body: Record<string, unknown>): BulkMessageRecipientPayload[] {
  const rawRecipients = body.recipients
  if (!Array.isArray(rawRecipients) || rawRecipients.length === 0) {
    throw new RequestBodyValidationError('Invalid recipients')
  }

  return rawRecipients.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new RequestBodyValidationError(`Invalid recipients[${index}]`)
    }

    const recipientBody = entry as Record<string, unknown>

    return {
      moodleUserId: readRequiredString(recipientBody, 'moodle_user_id', 255),
      personalizedMessage: readOptionalString(recipientBody, 'personalized_message', 12000),
      studentId: readRequiredString(recipientBody, 'student_id', 255),
      studentName: readRequiredString(recipientBody, 'student_name', 255),
    }
  })
}

export function parseBulkMessageSendPayload(rawBody: unknown): BulkMessageSendPayload {
  const body = expectBodyObject(rawBody)
  const jobId = readOptionalString(body, 'job_id', 255)

  if (jobId) {
    return {
      jobId,
      mode: 'existing',
      moodleUrl: readRequiredMoodleUrl(body),
      token: readRequiredString(body, 'token'),
    }
  }

  return {
    messageContent: readRequiredString(body, 'message_content', 12000),
    mode: 'create',
    moodleUrl: readRequiredMoodleUrl(body),
    origin: readOptionalLiteral(body, 'origin', ['manual', 'ia'] as const) ?? 'manual',
    recipients: readRecipients(body),
    templateId: readOptionalString(body, 'template_id', 255),
    token: readRequiredString(body, 'token'),
  }
}
