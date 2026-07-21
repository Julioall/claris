import {
  RequestBodyValidationError,
  expectBodyObject,
} from '../_shared/http/mod.ts'
import {
  TELEMETRY_ERROR_CATEGORIES,
  TELEMETRY_ERROR_SEVERITIES,
  type TelemetryAttributes,
  type TelemetryErrorCategory,
  type TelemetryErrorSeverity,
  type TelemetryJson,
} from './contract.ts'

export type AppTelemetryPayload = TrackUsagePayload | LogErrorPayload

export interface TrackUsagePayload {
  action: 'track_usage'
  eventType: string
  metadata: TelemetryAttributes
  resource?: string
  route?: string
}

export interface LogErrorPayload {
  action: 'log_error'
  category: TelemetryErrorCategory
  context: TelemetryAttributes
  message: string
  payload: TelemetryAttributes
  severity: TelemetryErrorSeverity
}

const ACTIONS = ['track_usage', 'log_error'] as const
const MAX_EVENT_TYPE_LENGTH = 128
const MAX_ROUTE_LENGTH = 1024
const MAX_RESOURCE_LENGTH = 255
const MAX_MESSAGE_LENGTH = 4096
const MAX_ATTRIBUTE_BYTES = 32 * 1024
const MAX_ATTRIBUTE_DEPTH = 6
const MAX_ATTRIBUTE_KEYS = 250
const MAX_ARRAY_ITEMS = 250
const MAX_JSON_STRING_LENGTH = 4096
const MAX_KEY_LENGTH = 128

function validationError(fieldName: string): RequestBodyValidationError {
  return new RequestBodyValidationError(`Invalid ${fieldName}`, 422)
}

function readRequiredString(
  body: Record<string, unknown>,
  fieldName: string,
  maxLength: number,
): string {
  const value = body[fieldName]
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw validationError(fieldName)
  }
  return value
}

function readOptionalString(
  body: Record<string, unknown>,
  fieldName: string,
  maxLength: number,
): string | undefined {
  const value = body[fieldName]
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > maxLength) throw validationError(fieldName)
  return value
}

function readRequiredLiteral<TValue extends string>(
  body: Record<string, unknown>,
  fieldName: string,
  allowedValues: readonly TValue[],
): TValue {
  const value = body[fieldName]
  if (typeof value !== 'string' || !allowedValues.includes(value as TValue)) {
    throw validationError(fieldName)
  }
  return value as TValue
}

function validateJsonValue(
  value: unknown,
  fieldName: string,
  depth: number,
  state: { keys: number },
): value is TelemetryJson {
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.length <= MAX_JSON_STRING_LENGTH

  if (depth >= MAX_ATTRIBUTE_DEPTH) return false
  if (Array.isArray(value)) {
    return value.length <= MAX_ARRAY_ITEMS
      && value.every((item) => validateJsonValue(item, fieldName, depth + 1, state))
  }

  if (!value || typeof value !== 'object') return false
  const entries = Object.entries(value)
  state.keys += entries.length
  if (state.keys > MAX_ATTRIBUTE_KEYS) return false

  return entries.every(([key, nestedValue]) => (
    key.length > 0
    && key.length <= MAX_KEY_LENGTH
    && validateJsonValue(nestedValue, fieldName, depth + 1, state)
  ))
}

function readOptionalAttributes(
  body: Record<string, unknown>,
  fieldName: string,
): TelemetryAttributes {
  const value = body[fieldName]
  if (value === undefined || value === null) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw validationError(fieldName)

  const state = { keys: 0 }
  if (!validateJsonValue(value, fieldName, 0, state)) throw validationError(fieldName)

  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw validationError(fieldName)
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_ATTRIBUTE_BYTES) {
    throw validationError(fieldName)
  }

  return value as TelemetryAttributes
}

function assertNoClientIdentity(body: Record<string, unknown>): void {
  if ('userId' in body || 'user_id' in body) throw validationError('userId')
}

export function parseAppTelemetryPayload(rawBody: unknown): AppTelemetryPayload {
  const body = expectBodyObject(rawBody)
  assertNoClientIdentity(body)
  const action = readRequiredLiteral(body, 'action', ACTIONS)

  if (action === 'track_usage') {
    return {
      action,
      eventType: readRequiredString(body, 'eventType', MAX_EVENT_TYPE_LENGTH),
      metadata: readOptionalAttributes(body, 'metadata'),
      resource: readOptionalString(body, 'resource', MAX_RESOURCE_LENGTH),
      route: readOptionalString(body, 'route', MAX_ROUTE_LENGTH),
    }
  }

  return {
    action,
    category: body.category === undefined
      ? 'ui'
      : readRequiredLiteral(body, 'category', TELEMETRY_ERROR_CATEGORIES),
    context: readOptionalAttributes(body, 'context'),
    message: readRequiredString(body, 'message', MAX_MESSAGE_LENGTH),
    payload: readOptionalAttributes(body, 'payload'),
    severity: body.severity === undefined
      ? 'error'
      : readRequiredLiteral(body, 'severity', TELEMETRY_ERROR_SEVERITIES),
  }
}
