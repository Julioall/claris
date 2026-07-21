import type {
  TelemetryAttributes,
  TelemetryJson,
  TelemetryRecordedDto,
} from './contract.ts'
import type { AppTelemetryPayload } from './payload.ts'
import type { AppTelemetryRepository } from './repository.ts'

const REDACTED_VALUE = '[REDACTED]'
const SENSITIVE_KEY_FRAGMENTS = [
  'apikey',
  'authorization',
  'cookie',
  'credential',
  'password',
  'passwd',
  'secret',
  'token',
] as const

function isSensitiveKey(key: string): boolean {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalizedKey.includes(fragment))
}

function redactJson(value: TelemetryJson): TelemetryJson {
  if (Array.isArray(value)) return value.map(redactJson)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [
    key,
    isSensitiveKey(key) ? REDACTED_VALUE : redactJson(nestedValue),
  ]))
}

export function redactTelemetryAttributes(attributes: TelemetryAttributes): TelemetryAttributes {
  return redactJson(attributes) as TelemetryAttributes
}

export async function recordAppTelemetry(
  repository: AppTelemetryRepository,
  authenticatedUserId: string,
  payload: AppTelemetryPayload,
): Promise<TelemetryRecordedDto> {
  if (payload.action === 'track_usage') {
    await repository.insertUsageEvent({
      eventType: payload.eventType,
      metadata: redactTelemetryAttributes(payload.metadata),
      resource: payload.resource ?? null,
      route: payload.route ?? null,
      userId: authenticatedUserId,
    })
  } else {
    await repository.insertErrorLog({
      category: payload.category,
      context: redactTelemetryAttributes(payload.context),
      message: payload.message,
      payload: redactTelemetryAttributes(payload.payload),
      severity: payload.severity,
      userId: authenticatedUserId,
    })
  }

  return { recorded: true }
}
