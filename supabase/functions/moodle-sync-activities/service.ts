import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { callMoodleApi } from '../_shared/moodle/mod.ts'

const ALLOWED_ACTIVITY_TYPES = ['quiz', 'assign', 'forum']

export async function syncActivities(moodleUrl: string, token: string, courseId: number): Promise<Response> {
  const supabase = createServiceClient()

  const { data: dbCourse } = await supabase
    .from('courses')
    .select('id')
    .eq('moodle_course_id', String(courseId))
    .maybeSingle()

  if (!dbCourse) return errorResponse('Course not found in database', 404)

  let courseContents: any[] = []
  try {
    courseContents = await callMoodleApi(moodleUrl, token, 'core_course_get_contents', { courseid: courseId })
    console.log(`Found ${courseContents?.length || 0} sections in course ${courseId}`)
  } catch (err) {
    console.error(`Error fetching course contents for ${courseId}:`, err)
    return jsonResponse({ success: true, activitiesCount: 0 })
  }

  const { data: studentCourses } = await supabase
    .from('student_courses')
    .select('student_id')
    .eq('course_id', dbCourse.id)

  const studentIds = studentCourses?.map((sc: any) => sc.student_id) || []
  if (studentIds.length === 0) return jsonResponse({ success: true, activitiesCount: 0 })

  // Extract activities
  const activities = extractActivities(courseContents)
  console.log(`Found ${activities.length} activities (quiz/assign/forum) in course ${courseId}`)
  if (activities.length === 0) return jsonResponse({ success: true, activitiesCount: 0 })

  // Fetch due dates
  const assignDueDates = await fetchAssignDueDates(moodleUrl, token, courseId, activities)
  const quizDueDates = await fetchQuizDueDates(moodleUrl, token, courseId, activities)

  // Build and upsert records
  const now = new Date().toISOString()
  const activityRecords = buildActivityRecords(activities, studentIds, dbCourse.id, assignDueDates, quizDueDates, now)

  console.log(`Preparing to upsert ${activityRecords.length} activity records`)

  const BATCH_SIZE = 500
  let activitiesCount = 0
  for (let i = 0; i < activityRecords.length; i += BATCH_SIZE) {
    const batch = activityRecords.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('student_activities')
      .upsert(batch, { onConflict: 'student_id,course_id,moodle_activity_id', ignoreDuplicates: false })

    if (error) console.error(`Error upserting activity batch ${i / BATCH_SIZE}:`, error)
    else activitiesCount += batch.length
  }

  console.log(`Upserted ${activitiesCount} activity records`)
  return jsonResponse({ success: true, activitiesCount })
}

// --- Helper functions ---

function extractActivities(courseContents: any[]): any[] {
  const activities: any[] = []
  for (const section of courseContents) {
    if (section.modules) {
      for (const mod of section.modules) {
        if (ALLOWED_ACTIVITY_TYPES.includes(mod.modname)) {
          activities.push({
            id: mod.id,
            name: mod.name,
            modname: mod.modname,
            completion: mod.completion,
            completiondata: mod.completiondata,
          })
        }
      }
    }
  }
  return activities
}

async function fetchAssignDueDates(
  moodleUrl: string,
  token: string,
  courseId: number,
  activities: any[]
): Promise<Record<string, string | null>> {
  const dueDates: Record<string, string | null> = {}
  const assignActivities = activities.filter((a) => a.modname === 'assign')

  if (assignActivities.length === 0) return dueDates

  try {
    const assignData = await callMoodleApi(moodleUrl, token, 'mod_assign_get_assignments', { 'courseids[0]': courseId })
    if (assignData?.courses?.[0]?.assignments) {
      for (const assignment of assignData.courses[0].assignments) {
        if (assignment.cmid && assignment.duedate && assignment.duedate > 0) {
          dueDates[String(assignment.cmid)] = new Date(assignment.duedate * 1000).toISOString()
        }
      }
    }
    console.log(`Fetched due dates for ${Object.keys(dueDates).length} assignments`)
  } catch (err) {
    console.error('Error fetching assignment details:', err)
  }

  return dueDates
}

async function fetchQuizDueDates(
  moodleUrl: string,
  token: string,
  courseId: number,
  activities: any[]
): Promise<Record<string, string | null>> {
  const dueDates: Record<string, string | null> = {}
  const quizActivities = activities.filter((a) => a.modname === 'quiz')

  if (quizActivities.length === 0) return dueDates

  try {
    const quizData = await callMoodleApi(moodleUrl, token, 'mod_quiz_get_quizzes_by_courses', { 'courseids[0]': courseId })
    if (quizData?.quizzes) {
      for (const q of quizData.quizzes) {
        if (q.coursemodule && q.timeclose && q.timeclose > 0) {
          dueDates[String(q.coursemodule)] = new Date(q.timeclose * 1000).toISOString()
        }
      }
    }
  } catch (err) {
    console.error('Error fetching quiz details:', err)
  }

  return dueDates
}

function buildActivityRecords(
  activities: any[],
  studentIds: string[],
  courseDbId: string,
  assignDueDates: Record<string, string | null>,
  quizDueDates: Record<string, string | null>,
  now: string
): any[] {
  const records: any[] = []

  for (const activity of activities) {
    let dueDate: string | null = null
    if (activity.modname === 'assign') dueDate = assignDueDates[String(activity.id)] || null
    else if (activity.modname === 'quiz') dueDate = quizDueDates[String(activity.id)] || null

    for (const studentId of studentIds) {
      const record: any = {
        student_id: studentId,
        course_id: courseDbId,
        moodle_activity_id: String(activity.id),
        activity_name: activity.name,
        activity_type: activity.modname,
        status: activity.completiondata?.state === 1 || activity.completiondata?.state === 2 ? 'completed' : 'pending',
        updated_at: now,
      }
      if (dueDate) record.due_date = dueDate
      records.push(record)
    }
  }

  return records
}
