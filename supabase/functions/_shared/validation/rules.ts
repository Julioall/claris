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
