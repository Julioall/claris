import {
  RequestBodyValidationError,
  expectBodyObject,
  readRequiredUuid,
} from '../_shared/http/mod.ts'

export interface BulkMessageAudiencePayload {
  action: 'get_audience'
  connectionId: string
}

export function parseBulkMessageAudiencePayload(rawBody: unknown): BulkMessageAudiencePayload {
  const body = expectBodyObject(rawBody)
  if (
    body.action !== 'get_audience'
    || Object.keys(body).some((field) => field !== 'action' && field !== 'connectionId')
  ) {
    throw new RequestBodyValidationError('Invalid bulk message audience request', 422)
  }
  return { action: 'get_audience', connectionId: readRequiredUuid(body, 'connectionId') }
}
