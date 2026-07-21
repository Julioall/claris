import { RequestBodyValidationError, expectBodyObject } from '../_shared/http/mod.ts'

export interface ActivityFeedPayload {
  action: 'list'
  limit: number
}

export function parseActivityFeedPayload(raw: unknown): ActivityFeedPayload {
  const body = expectBodyObject(raw)
  if (Object.keys(body).some((field) => field !== 'action' && field !== 'limit')) {
    throw new RequestBodyValidationError('Invalid request fields', 422)
  }
  if (body.action !== 'list') throw new RequestBodyValidationError('Invalid action', 422)
  const limit = body.limit ?? 20
  if (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 50) {
    throw new RequestBodyValidationError('Invalid limit', 422)
  }
  return { action: 'list', limit: Number(limit) }
}
