import {
  RequestBodyValidationError,
  expectBodyObject,
} from '../_shared/http/mod.ts'

export interface BulkMessageAudiencePayload {
  action: 'get_audience'
}

export function parseBulkMessageAudiencePayload(rawBody: unknown): BulkMessageAudiencePayload {
  const body = expectBodyObject(rawBody)
  if (body.action !== 'get_audience' || Object.keys(body).some((field) => field !== 'action')) {
    throw new RequestBodyValidationError('Invalid bulk message audience request', 422)
  }
  return { action: 'get_audience' }
}
