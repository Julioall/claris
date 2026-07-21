import type {
  GradeDiagnosticItemDto,
  GradeDiagnosticResultDto,
} from './contract.ts'
import type { GradeDiagnosticTarget } from './repository.ts'

const MAX_DIAGNOSTIC_ITEMS = 200

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown, maxLength = 500): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  return String(value).slice(0, maxLength)
}

function grade(value: unknown): number | string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return text(value, 100)
}

function mapGradeItem(value: unknown): GradeDiagnosticItemDto | null {
  const item = asRecord(value)
  if (!item) return null
  return {
    activityId: text(item.cmid, 100),
    gradeFormatted: text(item.gradeformatted, 200),
    gradeMax: grade(item.grademax),
    gradeRaw: grade(item.graderaw),
    itemName: text(item.itemname),
    itemType: text(item.itemtype, 100),
    module: text(item.itemmodule, 100),
    percentageFormatted: text(item.percentageformatted, 100),
  }
}

export function mapGradeDiagnosticResult(
  rawResponse: unknown,
  operationId: string,
  target: GradeDiagnosticTarget,
): Omit<GradeDiagnosticResultDto, 'contractVersion'> {
  const response = asRecord(rawResponse)
  const userGrades = Array.isArray(response?.usergrades) ? response.usergrades : []
  const firstUserGrade = asRecord(userGrades[0])
  const rawItems = Array.isArray(firstUserGrade?.gradeitems) ? firstUserGrade.gradeitems : []
  const mappedItems = rawItems
    .slice(0, MAX_DIAGNOSTIC_ITEMS)
    .map(mapGradeItem)
    .filter((item): item is GradeDiagnosticItemDto => Boolean(item))
  const courseGrade = rawItems
    .map(mapGradeItem)
    .find((item) => item?.itemType === 'course') ?? null

  return {
    course: { id: target.course.id, name: target.course.name },
    courseGrade,
    items: mappedItems,
    operationId,
    student: { id: target.student.id, fullName: target.student.fullName },
    summary: {
      returnedItems: mappedItems.length,
      totalItems: rawItems.length,
      truncated: rawItems.length > MAX_DIAGNOSTIC_ITEMS,
    },
  }
}
