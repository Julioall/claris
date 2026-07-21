import {
  RequestBodyValidationError,
  expectBodyObject,
} from '../_shared/http/mod.ts'
import { validateUuid } from '../_shared/validation/mod.ts'

export type ClarisSuggestionsPayload =
  | { action: 'list_pending'; limit: number }
  | { action: 'accept'; suggestionId: string }
  | { action: 'dismiss'; suggestionId: string }

const ACTION_FIELDS = {
  list_pending: new Set(['action', 'limit']),
  accept: new Set(['action', 'suggestionId']),
  dismiss: new Set(['action', 'suggestionId']),
} as const

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

function assertExactFields(
  body: Record<string, unknown>,
  action: keyof typeof ACTION_FIELDS,
): void {
  if (Object.keys(body).some((field) => !ACTION_FIELDS[action].has(field))) {
    invalid('Invalid request fields')
  }
}

function readUuid(value: unknown): string {
  if (typeof value !== 'string' || !validateUuid(value)) invalid('Invalid suggestionId')
  return value.toLowerCase()
}

export function parseClarisSuggestionsPayload(raw: unknown): ClarisSuggestionsPayload {
  const body = expectBodyObject(raw)
  const action = body.action
  if (action !== 'list_pending' && action !== 'accept' && action !== 'dismiss') {
    invalid('Invalid action')
  }
  assertExactFields(body, action)

  if (action === 'list_pending') {
    const limit = body.limit ?? 10
    if (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 30) {
      invalid('Invalid limit')
    }
    return { action, limit: Number(limit) }
  }

  return { action, suggestionId: readUuid(body.suggestionId) }
}
