import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import {
  findCourseByMoodleCourseId,
  listCourseEnrollmentsWithMoodleUserId,
  upsertStudentActivities,
  upsertStudentCourseGrades,
} from '../_shared/domain/moodle-sync/repository.ts'
import { callMoodleApi } from '../_shared/moodle/mod.ts'
import { parseNullableNumber, parseNullablePercentage } from '../_shared/validation/mod.ts'

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

function hasGradebookWeight(item: Record<string, unknown>, itemGradeMax: number | null): boolean {
  const numericWeightCandidates = [
    item.weightraw,
    item.weight,
    item.aggregationweight,
    item.contributiontocoursetotal,
  ]

  for (const candidate of numericWeightCandidates) {
    const parsed = parseNullableWeight(candidate)
    if (parsed !== null) return parsed > 0
  }

  const formattedWeightCandidates = [
    item.weightformatted,
    item.weightrawformatted,
    item.aggregationweightformatted,
  ]

  for (const candidate of formattedWeightCandidates) {
    const parsed = parseNullableWeight(candidate)
    if (parsed !== null) return parsed > 0
  }

  return (itemGradeMax ?? 0) > 0
}

export async function syncGrades(moodleUrl: string, token: string, courseId: number): Promise<Response> {
  const supabase = createServiceClient()

  const gradesCourse = await findCourseByMoodleCourseId(supabase, String(courseId))

  if (!gradesCourse) return errorResponse('Course not found in database', 404)

  const enrolledStudents = await listCourseEnrollmentsWithMoodleUserId(supabase, gradesCourse.id)

  if (!enrolledStudents?.length) return jsonResponse({ success: true, gradesCount: 0 })

  console.log(`Syncing grades for ${enrolledStudents.length} students in course ${courseId}`)

  const activityGradeRecords: Record<string, unknown>[] = []
  const courseGradeRecords: Record<string, unknown>[] = []
  const now = new Date().toISOString()

  for (const enrollment of enrolledStudents) {
    const moodleUserId = parseInt(enrollment.moodle_user_id, 10)

    try {
      const gradesData = await callMoodleApi(moodleUrl, token, 'gradereport_user_get_grade_items', {
        courseid: courseId,
        userid: moodleUserId,
      })

      if (gradesData.usergrades?.[0]) {
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

        courseGradeRecords.push({
          student_id: enrollment.student_id,
          course_id: gradesCourse.id,
          grade_raw: courseGradeRaw,
          grade_max: courseGradeMax,
          grade_percentage: courseGradePercentage,
          grade_formatted: courseGradeFormatted,
          letter_grade: courseLetterGrade,
          last_sync: now,
          updated_at: now,
        })

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

          // Derive timestamps from gradebook
          const gradedAtRaw = item.gradedategraded
          const submittedAtRaw = item.gradedatesubmitted
          const gradedAt = gradedAtRaw && gradedAtRaw > 0 ? new Date(gradedAtRaw * 1000).toISOString() : null
          const submittedAt = submittedAtRaw && submittedAtRaw > 0 ? new Date(submittedAtRaw * 1000).toISOString() : null

          // Derive status from available data
          let activityStatus = 'pending'
          if (itemGradeRaw !== null && gradedAt) {
            activityStatus = 'graded'
          } else if (submittedAt) {
            activityStatus = 'submitted'
          }

          activityGradeRecords.push({
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
      }
    } catch (gradeErr) {
      console.error(`Error fetching grades for student ${moodleUserId}:`, gradeErr)
    }
  }

  // Batch upsert activity grades
  let activityGradesCount = 0
  if (activityGradeRecords.length > 0) {
    const BATCH_SIZE = 200
    for (let i = 0; i < activityGradeRecords.length; i += BATCH_SIZE) {
      const batch = activityGradeRecords.slice(i, i + BATCH_SIZE)
      try {
        activityGradesCount += await upsertStudentActivities(supabase, batch, batch.length)
      } catch (error) {
        console.error(`Error upserting activity grade batch:`, error)
      }
    }
  }

  let gradesCount = 0
  if (courseGradeRecords.length > 0) {
    const BATCH_SIZE = 100
    for (let i = 0; i < courseGradeRecords.length; i += BATCH_SIZE) {
      const batch = courseGradeRecords.slice(i, i + BATCH_SIZE)
      try {
        gradesCount += await upsertStudentCourseGrades(supabase, batch, batch.length)
      } catch (error) {
        console.error(`Error upserting course grade batch:`, error)
      }
    }
  }

  return jsonResponse({ success: true, gradesCount, activityGradesCount })
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
