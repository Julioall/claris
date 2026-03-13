import {
  expectBodyObject,
  readRequiredMoodleUrl,
  readRequiredString,
} from '../_shared/http/mod.ts'

export interface BulkMessageSendPayload {
  jobId: string
  moodleUrl: string
  token: string
}

export function parseBulkMessageSendPayload(rawBody: unknown): BulkMessageSendPayload {
  const body = expectBodyObject(rawBody)

  return {
    jobId: readRequiredString(body, 'job_id'),
    moodleUrl: readRequiredMoodleUrl(body),
    token: readRequiredString(body, 'token'),
  }
}