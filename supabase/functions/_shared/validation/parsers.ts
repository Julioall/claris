// --- Parsing Helpers ---

export function parseNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null
  const parsed = typeof value === 'string' ? parseFloat(value) : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseNullablePercentage(value: unknown): number | null {
  if (value === undefined || value === null) return null
  const cleanPercentage = String(value).replace(/[%\s]/g, '').replace(',', '.')
  const parsed = parseFloat(cleanPercentage)
  return Number.isFinite(parsed) ? parsed : null
}
