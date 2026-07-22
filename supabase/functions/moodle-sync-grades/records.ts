import type {
  StudentActivityInsert,
  StudentCourseGradeInsert,
} from '../_shared/domain/moodle-sync/repository.ts'
import { parseNullableNumber, parseNullablePercentage } from '../_shared/validation/mod.ts'
import type { MoodleUserGradeReport } from './bulk.ts'

export interface GradeRecordContext {
  clarisCourseId: string
  studentId: string
  syncedAt: string
}

export interface NormalizedGradeRecords {
  activityRecords: StudentActivityInsert[]
  courseGradeRecord: StudentCourseGradeInsert
}

function readOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : null
}

function parseNullableWeight(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null

  const normalized = value.trim().replace('%', '').replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function hasGradebookWeight(
  item: Record<string, unknown>,
  itemGradeMax: number | null,
): boolean {
  const itemType = readOptionalText(item.itemtype)?.toLowerCase()
  if (itemType === 'category' || itemType === 'course') return false
  if (item.hidden === true || item.gradeishidden === true) return false

  const weightCandidates = [
    item.weightraw,
    item.weight,
    item.aggregationweight,
    item.contributiontocoursetotal,
    item.weightformatted,
    item.weightrawformatted,
    item.aggregationweightformatted,
  ]
  for (const candidate of weightCandidates) {
    const parsed = parseNullableWeight(candidate)
    if (parsed !== null) return parsed > 0
  }

  return itemGradeMax !== null && itemGradeMax > 0
}

function timestampToIso(value: unknown): string | null {
  const timestamp = parseNullableNumber(value)
  return timestamp !== null && timestamp > 0
    ? new Date(timestamp * 1_000).toISOString()
    : null
}

/** Normalizes the response differences observed in Moodle 4.5 and 5.1. */
export function normalizeMoodleGradeReport(
  report: MoodleUserGradeReport,
  context: GradeRecordContext,
): NormalizedGradeRecords {
  const gradeItems = report.gradeitems ?? []
  const courseGradeItem = gradeItems.find((item) => item?.itemtype === 'course') ?? null
  const courseGradeRaw = parseNullableNumber(courseGradeItem?.graderaw)
  const courseGradeMax = parseNullableNumber(courseGradeItem?.grademax)

  const courseGradeRecord: StudentCourseGradeInsert = {
    student_id: context.studentId,
    course_id: context.clarisCourseId,
    grade_raw: courseGradeRaw,
    grade_max: courseGradeMax,
    grade_percentage: parseNullablePercentage(courseGradeItem?.percentageformatted),
    grade_formatted: readOptionalText(courseGradeItem?.gradeformatted),
    letter_grade: readOptionalText(
      courseGradeItem?.lettergrade ?? courseGradeItem?.lettergradeformatted,
    ),
    last_sync: context.syncedAt,
    updated_at: context.syncedAt,
  }

  const activityRecords: StudentActivityInsert[] = []
  for (const item of gradeItems) {
    if (!item || item.itemtype === 'course' || item.itemtype === 'category') continue
    const cmid = item.cmid != null ? String(item.cmid) : null
    if (!cmid) continue

    const grade = parseNullableNumber(item.graderaw)
    const gradeMax = parseNullableNumber(item.grademax)
    const percentage = grade !== null && gradeMax !== null && gradeMax > 0
      ? (grade / gradeMax) * 100
      : parseNullablePercentage(item.percentageformatted)
    const gradedAt = timestampToIso(item.gradedategraded)
    const submittedAt = timestampToIso(item.gradedatesubmitted)
    const status = grade !== null && gradedAt
      ? 'graded'
      : submittedAt
      ? 'submitted'
      : 'pending'

    activityRecords.push({
      student_id: context.studentId,
      course_id: context.clarisCourseId,
      moodle_activity_id: cmid,
      activity_name: readOptionalText(item.itemname) ?? 'Atividade',
      activity_type: readOptionalText(item.itemmodule),
      grade,
      grade_max: gradeMax,
      percentage,
      status,
      graded_at: gradedAt,
      submitted_at: submittedAt,
      completed_at: gradedAt || submittedAt,
      hidden: !hasGradebookWeight(item, gradeMax),
      updated_at: context.syncedAt,
    })
  }

  return { activityRecords, courseGradeRecord }
}

