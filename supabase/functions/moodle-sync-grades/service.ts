import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import {
  findCourseByMoodleCourseId,
  listCourseEnrollmentsWithMoodleUserId,
  upsertStudentActivities,
  upsertStudentCourseGrades,
} from '../_shared/domain/moodle-sync/repository.ts'
import { refreshDashboardCourseActivityAggregates } from '../_shared/domain/dashboard-activity-aggregates.ts'
import { callMoodleApi } from '../_shared/moodle/mod.ts'
import { parseNullableNumber, parseNullablePercentage } from '../_shared/validation/mod.ts'

// Pool size increased from 8 to 16 for better parallelization
// Expected impact: ~50% reduction in total sync time for 100+ students
const GRADE_FETCH_POOL_SIZE = 16

function readOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : null
}

function parseNullableWeight(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null

  const normalized = value
    .trim()
    .replace('%', '')
    .replace(',', '.')

  if (!normalized) return null

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Determines if a grade item should contribute to course metrics.
 * 
 * Returns true if the item:
 * 1. Is not explicitly hidden (hidden === true or gradeishidden === true)
 * 2. Has explicit weight > 0 in gradebook (weightraw, weight, aggregationweight, etc.)
 * 3. Falls back to: has grademax > 0 AND is not a category/course item
 * 
 * Returns false for categories, course totals, and explicitly hidden items.
 */
function hasGradebookWeight(item: Record<string, unknown>, itemGradeMax: number | null): boolean {
  const itemType = readOptionalText(item.itemtype)?.toLowerCase()
  
  // 1. Categories and course totals never contribute individually
  if (itemType === 'category' || itemType === 'course') {
    return false
  }
  
  // 2. Explicitly hidden items do not contribute
  if (item.hidden === true || item.gradeishidden === true) {
    return false
  }
  
  // 3. Check for explicit weight (numeric, from Moodle)
  const numericWeightCandidates = [
    item.weightraw,
    item.weight,
    item.aggregationweight,
    item.contributiontocoursetotal,
  ]
  
  for (const candidate of numericWeightCandidates) {
    const parsed = parseNullableWeight(candidate)
    // Weight > 0 means contributes. Weight = 0 means explicitly excluded.
    if (parsed !== null) return parsed > 0
  }
  
  // 4. Check for formatted weight (fallback for parsing errors)
  const formattedWeightCandidates = [
    item.weightformatted,
    item.weightrawformatted,
    item.aggregationweightformatted,
  ]
  
  for (const candidate of formattedWeightCandidates) {
    const parsed = parseNullableWeight(candidate)
    if (parsed !== null) return parsed > 0
  }
  
  // 5. Fallback: if has grademax and is not a meta item, assume it contributes
  // (covers cases where weight is absent but the activity is clearly gradeable)
  return (itemGradeMax ?? 0) > 0
}

export async function syncGrades(moodleUrl: string, token: string, courseId: number): Promise<Response> {
  const supabase = createServiceClient()

  const gradesCourse = await findCourseByMoodleCourseId(supabase, String(courseId))

  if (!gradesCourse) return errorResponse('Course not found in database', 404)

  const enrolledStudents = await listCourseEnrollmentsWithMoodleUserId(supabase, gradesCourse.id)

  if (!enrolledStudents?.length) {
    await refreshDashboardAggregatesForCourse(supabase, gradesCourse.id)
    return jsonResponse({ success: true, gradesCount: 0 })
  }

  console.log(`Syncing grades for ${enrolledStudents.length} students in course ${courseId}`)

  const activityGradeRecords: Record<string, unknown>[] = []
  const courseGradeRecords: Record<string, unknown>[] = []
  const now = new Date().toISOString()

  for (let i = 0; i < enrolledStudents.length; i += GRADE_FETCH_POOL_SIZE) {
    const batch = enrolledStudents.slice(i, i + GRADE_FETCH_POOL_SIZE)

    const settled = await Promise.allSettled(
      batch.map(async (enrollment) => {
        const moodleUserId = parseInt(enrollment.moodle_user_id, 10)

        const gradesData = await callMoodleApi(moodleUrl, token, 'gradereport_user_get_grade_items', {
          courseid: courseId,
          userid: moodleUserId,
        })

        if (!gradesData.usergrades?.[0]) {
          return { courseGradeRecord: null, activityRecords: [] as Record<string, unknown>[] }
        }

        const gradeItems = gradesData.usergrades[0].gradeitems || []
        const courseGradeItem = gradeItems.find((item: Record<string, unknown>) => item?.itemtype === 'course') || null

        const courseGradeRaw = parseNullableNumber(courseGradeItem?.graderaw)
        const courseGradeMax = parseNullableNumber(courseGradeItem?.grademax)
        const courseGradePercentage = parseNullablePercentage(courseGradeItem?.percentageformatted)
        const courseGradeFormatted = readOptionalText(courseGradeItem?.gradeformatted)
        const courseLetterGrade = readOptionalText(
          courseGradeItem?.lettergrade ??
          courseGradeItem?.lettergradeformatted,
        )

        const courseGradeRecord = {
          student_id: enrollment.student_id,
          course_id: gradesCourse.id,
          grade_raw: courseGradeRaw,
          grade_max: courseGradeMax,
          grade_percentage: courseGradePercentage,
          grade_formatted: courseGradeFormatted,
          letter_grade: courseLetterGrade,
          last_sync: now,
          updated_at: now,
        }

        const activityRecords: Record<string, unknown>[] = []

        for (const item of gradeItems) {
          if (!item || item.itemtype === 'course' || item.itemtype === 'category') continue
          const cmid = item.cmid != null ? String(item.cmid) : null
          if (!cmid) continue

          const itemGradeRaw = parseNullableNumber(item.graderaw)
          const itemGradeMax = parseNullableNumber(item.grademax)
          const showInMetrics = hasGradebookWeight(item, itemGradeMax)
          let itemPercentage: number | null = null
          if (itemGradeRaw !== null && itemGradeMax && itemGradeMax > 0) {
            itemPercentage = (itemGradeRaw / itemGradeMax) * 100
          } else {
            itemPercentage = parseNullablePercentage(item.percentageformatted)
          }

          const gradedAtRaw = item.gradedategraded
          const submittedAtRaw = item.gradedatesubmitted
          const gradedAt = gradedAtRaw && gradedAtRaw > 0 ? new Date(gradedAtRaw * 1000).toISOString() : null
          const submittedAt = submittedAtRaw && submittedAtRaw > 0 ? new Date(submittedAtRaw * 1000).toISOString() : null

          let activityStatus = 'pending'
          if (itemGradeRaw !== null && gradedAt) {
            activityStatus = 'graded'
          } else if (submittedAt) {
            activityStatus = 'submitted'
          }

          activityRecords.push({
            student_id: enrollment.student_id,
            course_id: gradesCourse.id,
            moodle_activity_id: cmid,
            activity_name: item.itemname || 'Atividade',
            activity_type: item.itemmodule || null,
            grade: itemGradeRaw,
            grade_max: itemGradeMax,
            percentage: itemPercentage,
            status: activityStatus,
            graded_at: gradedAt,
            submitted_at: submittedAt,
            completed_at: gradedAt || submittedAt,
            hidden: !showInMetrics,
            updated_at: now,
          })
        }

        return { courseGradeRecord, activityRecords }
      })
    )

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        if (result.value.courseGradeRecord) {
          courseGradeRecords.push(result.value.courseGradeRecord)
        }
        activityGradeRecords.push(...result.value.activityRecords)
      } else {
        console.error(`Error fetching grades for course ${courseId}:`, result.reason)
      }
    }
  }

  // Batch upsert activity grades
  let activityGradesCount = 0
  if (activityGradeRecords.length > 0) {
    try {
      activityGradesCount = await upsertStudentActivities(supabase, activityGradeRecords, 200)
    } catch (error) {
      console.error('Error upserting activity grades:', error)
    }
  }

  let gradesCount = 0
  if (courseGradeRecords.length > 0) {
    try {
      gradesCount = await upsertStudentCourseGrades(supabase, courseGradeRecords, 100)
    } catch (error) {
      console.error('Error upserting course grades:', error)
    }
  }

  await refreshDashboardAggregatesForCourse(supabase, gradesCourse.id)

  return jsonResponse({ success: true, gradesCount, activityGradesCount })
}

async function refreshDashboardAggregatesForCourse(
  supabase: ReturnType<typeof createServiceClient>,
  courseId: string,
) {
  try {
    await refreshDashboardCourseActivityAggregates(supabase, [courseId])
  } catch (error) {
    console.error('[moodle-sync-grades] Error refreshing dashboard aggregates:', error)
  }
}

export async function debugGrades(
  moodleUrl: string,
  token: string,
  courseId: number,
  userId: number
): Promise<Response> {
  const gradesData = await callMoodleApi(moodleUrl, token, 'gradereport_user_get_grade_items', {
    courseid: courseId,
    userid: userId,
  })

  return jsonResponse({
    success: true,
    raw_response: gradesData,
    course_grade_item: gradesData.usergrades?.[0]?.gradeitems?.find((item: Record<string, unknown>) => item.itemtype === 'course'),
    all_item_types: gradesData.usergrades?.[0]?.gradeitems?.map((item: Record<string, unknown>) => ({
      itemtype: item.itemtype,
      itemname: item.itemname,
      cmid: item.cmid,
      itemmodule: item.itemmodule,
      graderaw: item.graderaw,
      grademax: item.grademax,
      gradeformatted: item.gradeformatted,
      percentageformatted: item.percentageformatted,
    })),
  })
}
