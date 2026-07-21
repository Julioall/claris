// --- Input Validation Helpers ---

export function validateMoodleUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return false
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

export function validatePositiveInteger(value: unknown): value is number {
  if (value === undefined || value === null) return false
  const num = typeof value === 'number' ? value : parseInt(String(value), 10)
  return !isNaN(num) && Number.isFinite(num) && num > 0 && num < Number.MAX_SAFE_INTEGER
}

export function validateString(value: unknown, maxLength = 1024): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

export function validateStringArray(value: unknown, maxItems = 500): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((v) => typeof v === 'string' && v.length > 0 && v.length <= 255)
  )
}

export function validateBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

export function validateInteger(
  value: unknown,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

export function validateUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function validateIsoDate(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value))
}

export function validateObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function validateArray<TValue>(
  value: unknown,
  itemValidator: (item: unknown) => item is TValue,
  maxItems = 500,
): value is TValue[] {
  return Array.isArray(value) && value.length <= maxItems && value.every(itemValidator)
}
