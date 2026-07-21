export interface AttendanceDateSummaryRecord {
  ausente: number
  date: string
  justificado: number
  presente: number
  total: number
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parseNonNegativeCount(value: unknown): number {
  const count = typeof value === 'string' && /^\d+$/.test(value)
    ? Number(value)
    : value

  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
    throw new Error('Invalid attendance date summary count')
  }
  return count
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() + 1 === month
    && parsed.getUTCDate() === day
}

function parseDateSummary(value: unknown): AttendanceDateSummaryRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid attendance date summary')
  }

  const row = value as Record<string, unknown>
  if (!isIsoDate(row.date)) {
    throw new Error('Invalid attendance date summary date')
  }

  const summary = {
    ausente: parseNonNegativeCount(row.ausente),
    date: row.date,
    justificado: parseNonNegativeCount(row.justificado),
    presente: parseNonNegativeCount(row.presente),
    total: parseNonNegativeCount(row.total),
  }
  if (summary.total !== summary.presente + summary.ausente + summary.justificado) {
    throw new Error('Invalid attendance date summary total')
  }
  return summary
}

export function parseAttendanceDateSummaries(value: unknown): AttendanceDateSummaryRecord[] {
  if (value !== null && !Array.isArray(value)) {
    throw new Error('Invalid attendance date summaries')
  }
  return (value ?? []).map((row) => parseDateSummary(row))
}
