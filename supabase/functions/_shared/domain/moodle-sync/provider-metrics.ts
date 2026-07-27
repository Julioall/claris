import type { MoodleApiAttemptMetric, MoodleApiTelemetry } from '../../moodle/client.ts'

/**
 * Aggregated, payload-free Moodle provider metrics. These metrics deliberately
 * record only bounded counters and Moodle function names. Endpoint URLs,
 * request parameters, response bodies, identities and credentials never leave
 * the call site through this contract.
 */
export interface MoodleProviderOperationMetric {
  attempts: number
  durationMs: number
  failedAttempts: number
  responseBytes: number
  statuses: Record<string, number>
}

export interface MoodleProviderMetrics {
  moodleApiCalls: number
  moodleResponseBytes: number
  operations: Record<string, MoodleProviderOperationMetric>
}

export interface MoodleProviderMetricsMetadata {
  moodle_api_calls: number
  moodle_response_bytes: number
  moodle_provider_operations?: Record<string, MoodleProviderOperationMetric>
}

const EMPTY_METRICS: MoodleProviderMetrics = {
  moodleApiCalls: 0,
  moodleResponseBytes: 0,
  operations: {},
}

const MAX_OPERATION_BUCKETS = 32
const MAX_OPERATION_VALUE = 100_000
const MAX_DURATION_MS = 86_400_000
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024
const MOODLE_FUNCTION_PATTERN = /^[a-z][a-z0-9_]{1,95}$/

function safeNonnegativeInteger(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

function cappedAdd(left: number, right: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, left + right)
}

function cappedOperationValue(value: unknown, maximum = MAX_OPERATION_VALUE): number {
  return Math.min(maximum, safeNonnegativeInteger(value))
}

function isMoodleFunctionName(value: string): boolean {
  return MOODLE_FUNCTION_PATTERN.test(value)
}

function readStatuses(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const statuses: Record<string, number> = {}
  for (const [status, count] of Object.entries(value as Record<string, unknown>)) {
    if (!/^(?:none|[1-5][0-9]{2})$/.test(status)) continue
    statuses[status] = cappedOperationValue(count)
  }
  return statuses
}

function readOperations(value: unknown): Record<string, MoodleProviderOperationMetric> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const operations: Record<string, MoodleProviderOperationMetric> = {}
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(operations).length >= MAX_OPERATION_BUCKETS || !isMoodleFunctionName(name)) continue
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const item = raw as Record<string, unknown>
    operations[name] = {
      attempts: cappedOperationValue(item.attempts),
      durationMs: cappedOperationValue(item.duration_ms ?? item.durationMs, MAX_DURATION_MS),
      failedAttempts: cappedOperationValue(item.failed_attempts ?? item.failedAttempts),
      responseBytes: cappedOperationValue(item.response_bytes ?? item.responseBytes, MAX_RESPONSE_BYTES),
      statuses: readStatuses(item.statuses),
    }
  }
  return operations
}

function mergeStatuses(
  left: Record<string, number>,
  right: Record<string, number>,
): Record<string, number> {
  const statuses: Record<string, number> = { ...left }
  for (const [status, count] of Object.entries(right)) {
    statuses[status] = cappedOperationValue((statuses[status] ?? 0) + count)
  }
  return statuses
}

function mergeOperations(
  left: Record<string, MoodleProviderOperationMetric>,
  right: Record<string, MoodleProviderOperationMetric>,
): Record<string, MoodleProviderOperationMetric> {
  const operations: Record<string, MoodleProviderOperationMetric> = {}
  for (const [name, metric] of Object.entries(left)) operations[name] = { ...metric, statuses: { ...metric.statuses } }
  for (const [name, metric] of Object.entries(right)) {
    const current = operations[name]
    if (!current && Object.keys(operations).length >= MAX_OPERATION_BUCKETS) continue
    operations[name] = current
      ? {
        attempts: cappedOperationValue(current.attempts + metric.attempts),
        durationMs: cappedOperationValue(current.durationMs + metric.durationMs, MAX_DURATION_MS),
        failedAttempts: cappedOperationValue(current.failedAttempts + metric.failedAttempts),
        responseBytes: cappedOperationValue(current.responseBytes + metric.responseBytes, MAX_RESPONSE_BYTES),
        statuses: mergeStatuses(current.statuses, metric.statuses),
      }
      : { ...metric, statuses: { ...metric.statuses } }
  }
  return operations
}

function serializedByteLength(value: unknown): number {
  try {
    const serialized = JSON.stringify(value)
    return typeof serialized === 'string'
      ? new TextEncoder().encode(serialized).byteLength
      : 0
  } catch {
    return 0
  }
}

export function readMoodleProviderMetrics(value: unknown): MoodleProviderMetrics {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...EMPTY_METRICS }
  const metadata = value as Record<string, unknown>
  return {
    moodleApiCalls: safeNonnegativeInteger(metadata.moodle_api_calls),
    moodleResponseBytes: safeNonnegativeInteger(metadata.moodle_response_bytes),
    operations: readOperations(metadata.moodle_provider_operations),
  }
}

export function mergeMoodleProviderMetrics(
  ...metrics: MoodleProviderMetrics[]
): MoodleProviderMetrics {
  return metrics.reduce((total, current) => ({
    moodleApiCalls: cappedAdd(total.moodleApiCalls, safeNonnegativeInteger(current.moodleApiCalls)),
    moodleResponseBytes: cappedAdd(
      total.moodleResponseBytes,
      safeNonnegativeInteger(current.moodleResponseBytes),
    ),
    operations: mergeOperations(total.operations, current.operations),
  }), { ...EMPTY_METRICS, operations: {} })
}

export function toMoodleProviderMetricsMetadata(
  metrics: MoodleProviderMetrics,
): MoodleProviderMetricsMetadata {
  const metadata: MoodleProviderMetricsMetadata = {
    moodle_api_calls: safeNonnegativeInteger(metrics.moodleApiCalls),
    moodle_response_bytes: safeNonnegativeInteger(metrics.moodleResponseBytes),
  }
  if (Object.keys(metrics.operations).length > 0) {
    metadata.moodle_provider_operations = mergeOperations({}, metrics.operations)
  }
  return metadata
}

export function createMoodleProviderMetrics(initial?: MoodleProviderMetrics): {
  call<T>(operation: () => Promise<T>): Promise<T>
  recordAttempt(metric: MoodleApiAttemptMetric): void
  snapshot(): MoodleProviderMetrics
  telemetry(): MoodleApiTelemetry
} {
  let metrics = mergeMoodleProviderMetrics(initial ?? EMPTY_METRICS)

  const recordAttempt = (metric: MoodleApiAttemptMetric): void => {
    if (!isMoodleFunctionName(metric.wsfunction)) return
    const status = metric.status === null ? 'none' : String(metric.status)
    const next: MoodleProviderOperationMetric = {
      attempts: 1,
      durationMs: cappedOperationValue(metric.durationMs, MAX_DURATION_MS),
      failedAttempts: metric.outcome === 'error' ? 1 : 0,
      responseBytes: cappedOperationValue(metric.responseBytes, MAX_RESPONSE_BYTES),
      statuses: /^(?:none|[1-5][0-9]{2})$/.test(status) ? { [status]: 1 } : {},
    }
    metrics = {
      moodleApiCalls: metrics.moodleApiCalls,
      moodleResponseBytes: cappedAdd(metrics.moodleResponseBytes, next.responseBytes),
      operations: mergeOperations(metrics.operations, { [metric.wsfunction]: next }),
    }
  }

  return {
    async call<T>(operation: () => Promise<T>): Promise<T> {
      const attemptsBefore = Object.values(metrics.operations)
        .reduce((total, metric) => total + metric.attempts, 0)
      metrics = mergeMoodleProviderMetrics(metrics, {
        moodleApiCalls: 1,
        moodleResponseBytes: 0,
        operations: {},
      })
      const response = await operation()
      const attemptsAfter = Object.values(metrics.operations)
        .reduce((total, metric) => total + metric.attempts, 0)
      if (attemptsAfter === attemptsBefore) {
        metrics = mergeMoodleProviderMetrics(metrics, {
          moodleApiCalls: 0,
          moodleResponseBytes: serializedByteLength(response),
          operations: {},
        })
      }
      return response
    },
    recordAttempt,
    snapshot(): MoodleProviderMetrics {
      return mergeMoodleProviderMetrics(metrics)
    },
    telemetry(): MoodleApiTelemetry {
      return { onAttempt: recordAttempt }
    },
  }
}
