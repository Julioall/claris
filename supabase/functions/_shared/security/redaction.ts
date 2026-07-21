const SENSITIVE_KEY = /(?:api[_-]?key|authorization|cookie|credential|password|secret|session|token)/i
const MAX_DEPTH = 8
const MAX_ARRAY_ITEMS = 200
const MAX_OBJECT_FIELDS = 200

export function redactSensitiveJson(value: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) return '[TRUNCATED]'
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactSensitiveJson(item, depth + 1))
  }
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_OBJECT_FIELDS)
      .map(([key, nested]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactSensitiveJson(nested, depth + 1),
      ]),
  )
}

export function redactSensitiveObject(value: unknown): Record<string, unknown> {
  const redacted = redactSensitiveJson(value)
  return redacted && typeof redacted === 'object' && !Array.isArray(redacted)
    ? redacted as Record<string, unknown>
    : {}
}
