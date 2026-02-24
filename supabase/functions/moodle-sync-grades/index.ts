import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { parseNullableNumber, parseNullablePercentage } from '../_shared/validation.ts'
import { callMoodleApi } from '../_shared/moodle-client.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const body = await req.json()
    const { action, moodleUrl, token, courseId, userId } = body

    // Support debug_grades action
    if (action === 'debug_grades') {
      return await handleDebugGrades(body)
    }

    // Default: sync_grades
    return await handleSyncGrades(body)
  } catch (error: unknown) {
    console.error('Error in moodle-sync-grades:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', 500)
  }
})

async function handleSyncGrades(body: any): Promise<Response> {
  const { moodleUrl, token, courseId } = body
  if (!moodleUrl || !token || !courseId) {
    return errorResponse('Missing required fields: moodleUrl, token, courseId')
  }

  const supabase = createServiceClient()

  const { data: gradesCourse } = await supabase
    .from('courses')
    .select('id')
    .eq('moodle_course_id', String(courseId))
    .maybeSingle()

  if (!gradesCourse) return errorResponse('Course not found in database', 404)

  const { data: enrolledStudents } = await supabase
    .from('student_courses')
    .select('student_id, students!inner(id, moodle_user_id)')
    .eq('course_id', gradesCourse.id)

  if (!enrolledStudents?.length) return jsonResponse({ success: true, gradesCount: 0 })

  console.log(`Syncing grades for ${enrolledStudents.length} students in course ${courseId}`)

  const activityGradeRecords: any[] = []
  const now = new Date().toISOString()
  const enrolledStudentIds = enrolledStudents.map((e: any) => e.student_id)

  for (const enrollment of enrolledStudents) {
    const student = enrollment.students as any
    const moodleUserId = parseInt(student.moodle_user_id, 10)

    try {
      const gradesData = await callMoodleApi(moodleUrl, token, 'gradereport_user_get_grade_items', {
        courseid: courseId,
        userid: moodleUserId,
      })

      if (gradesData.usergrades?.[0]) {
        const gradeItems = gradesData.usergrades[0].gradeitems || []

        for (const item of gradeItems) {
          if (!item || item.itemtype === 'course' || item.itemtype === 'category') continue
          const cmid = item.cmid != null ? String(item.cmid) : null
          if (!cmid) continue

          const itemGradeRaw = parseNullableNumber(item.graderaw)
          const itemGradeMax = parseNullableNumber(item.grademax)
          let itemPercentage: number | null = null
          if (itemGradeRaw !== null && itemGradeMax && itemGradeMax > 0) {
            itemPercentage = (itemGradeRaw / itemGradeMax) * 100
          } else {
            itemPercentage = parseNullablePercentage(item.percentageformatted)
          }

          activityGradeRecords.push({
            student_id: student.id,
            course_id: gradesCourse.id,
            moodle_activity_id: cmid,
            activity_name: item.itemname || 'Atividade',
            activity_type: item.itemmodule || null,
            grade: itemGradeRaw,
            grade_max: itemGradeMax,
            percentage: itemPercentage,
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
      const { error } = await supabase
        .from('student_activities')
        .upsert(batch, { onConflict: 'student_id,course_id,moodle_activity_id', ignoreDuplicates: false })

      if (error) console.error(`Error upserting activity grade batch:`, error)
      else activityGradesCount += batch.length
    }
  }

  // Recalculate course totals from visible activities
  const { data: visibleActivities } = await supabase
    .from('student_activities')
    .select('student_id, grade, grade_max')
    .eq('course_id', gradesCourse.id)
    .eq('hidden', false)
    .in('student_id', enrolledStudentIds)

  const totalsByStudent = new Map<string, { raw: number; max: number }>()
  for (const sid of enrolledStudentIds) totalsByStudent.set(sid, { raw: 0, max: 0 })

  for (const activity of visibleActivities || []) {
    if (activity.grade === null || activity.grade_max === null || activity.grade_max <= 0) continue
    const current = totalsByStudent.get(activity.student_id) || { raw: 0, max: 0 }
    current.raw += activity.grade
    current.max += activity.grade_max
    totalsByStudent.set(activity.student_id, current)
  }

  const gradeRecords = enrolledStudentIds.map((studentId: string) => {
    const totals = totalsByStudent.get(studentId) || { raw: 0, max: 0 }
    const hasGrade = totals.max > 0
    const normalizedGrade = hasGrade ? (totals.raw / totals.max) * 100 : null

    return {
      student_id: studentId,
      course_id: gradesCourse.id,
      grade_raw: normalizedGrade,
      grade_max: hasGrade ? 100 : null,
      grade_percentage: normalizedGrade,
      grade_formatted: hasGrade ? `${normalizedGrade!.toFixed(1)} / 100` : null,
      letter_grade: null,
      last_sync: now,
      updated_at: now,
    }
  })

  let gradesCount = 0
  if (gradeRecords.length > 0) {
    const BATCH_SIZE = 100
    for (let i = 0; i < gradeRecords.length; i += BATCH_SIZE) {
      const batch = gradeRecords.slice(i, i + BATCH_SIZE)
      const { error } = await supabase
        .from('student_course_grades')
        .upsert(batch, { onConflict: 'student_id,course_id', ignoreDuplicates: false })

      if (error) console.error(`Error upserting grade batch:`, error)
      else gradesCount += batch.length
    }
  }

  return jsonResponse({ success: true, gradesCount, activityGradesCount })
}

async function handleDebugGrades(body: any): Promise<Response> {
  const { moodleUrl, token, courseId, userId } = body
  if (!moodleUrl || !token || !courseId || !userId) {
    return errorResponse('Missing required fields: moodleUrl, token, courseId, userId')
  }

  try {
    const gradesData = await callMoodleApi(moodleUrl, token, 'gradereport_user_get_grade_items', {
      courseid: courseId,
      userid: userId,
    })

    return jsonResponse({
      success: true,
      raw_response: gradesData,
      course_grade_item: gradesData.usergrades?.[0]?.gradeitems?.find((item: any) => item.itemtype === 'course'),
      all_item_types: gradesData.usergrades?.[0]?.gradeitems?.map((item: any) => ({
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
  } catch (err) {
    console.error('Debug grades error:', err)
    return errorResponse(err instanceof Error ? err.message : 'Failed to fetch grades', 500)
  }
}
