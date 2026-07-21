import {
  RequestBodyValidationError,
  expectBodyObject,
} from '../_shared/http/mod.ts'
import { TASK_TAG_PREFIXES, type TaskTagPrefix } from './contract.ts'

export interface TaskTagSuggestionsPayload {
  action: 'search_suggestions'
  prefix: TaskTagPrefix
  query: string
}

const ACTIONS = ['search_suggestions'] as const
const MAX_QUERY_LENGTH = 100

function readLiteral<TValue extends string>(
  body: Record<string, unknown>,
  fieldName: string,
  allowedValues: readonly TValue[],
): TValue {
  const value = body[fieldName]
  if (typeof value !== 'string' || !allowedValues.includes(value as TValue)) {
    throw new RequestBodyValidationError(`Invalid ${fieldName}`, 422)
  }
  return value as TValue
}

export function parseTaskTagSuggestionsPayload(rawBody: unknown): TaskTagSuggestionsPayload {
  const body = expectBodyObject(rawBody)

  if ('userId' in body || 'user_id' in body || 'courseIds' in body || 'course_ids' in body) {
    throw new RequestBodyValidationError('Client-provided scope is not allowed', 422)
  }

  const query = body.query
  if (typeof query !== 'string' || query.length > MAX_QUERY_LENGTH) {
    throw new RequestBodyValidationError('Invalid query', 422)
  }

  return {
    action: readLiteral(body, 'action', ACTIONS),
    prefix: readLiteral(body, 'prefix', TASK_TAG_PREFIXES),
    query: query.trim(),
  }
}
