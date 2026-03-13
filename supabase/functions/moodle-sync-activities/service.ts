import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import type { AppSupabaseClient } from '../_shared/db/mod.ts'
import {
  findCourseByMoodleCourseId,
  listStudentIdsByCourseId,
  listStudentsWithMoodleUserId,
  upsertStudentActivities,
} from '../_shared/domain/moodle-sync/repository.ts'
import { callMoodleApi } from '../_shared/moodle/mod.ts'

const ALLOWED_ACTIVITY_TYPES = ['quiz', 'assign', 'forum']

export async function syncActivities(moodleUrl: string, token: string, courseId: number): Promise<Response> {
  const supabase = createServiceClient()

  const dbCourse = await findCourseByMoodleCourseId(supabase, String(courseId))

  if (!dbCourse) return errorResponse('Course not found in database', 404)

  let courseContents: unknown[] = []
  let activitiesFromFallback: unknown[] | null = null
  try {
    courseContents = await callMoodleApi(moodleUrl, token, 'core_course_get_contents', { courseid: courseId })
    console.log(`Found ${courseContents?.length || 0} sections in course ${courseId}`)
  } catch (err) {
    console.error(`Error fetching course contents for ${courseId}:`, err)
    activitiesFromFallback = await fetchActivitiesFallback(moodleUrl, token, courseId)
    console.log(`Fallback found ${activitiesFromFallback.length} activities in course ${courseId}`)
  }

  const studentIds = await listStudentIdsByCourseId(supabase, dbCourse.id)
  if (studentIds.length === 0) return jsonResponse({ success: true, activitiesCount: 0 })

  // Extract activities
  const activities = activitiesFromFallback ?? extractActivities(courseContents)
  console.log(`Found ${activities.length} activities (quiz/assign/forum) in course ${courseId}`)
  if (activities.length === 0) return jsonResponse({ success: true, activitiesCount: 0 })

  // Fetch due dates
  const assignDueDates = await fetchAssignDueDates(moodleUrl, token, courseId, activities)
  const quizDueDates = await fetchQuizDueDates(moodleUrl, token, courseId, activities)

  // Fetch per-student completion status
  const completionByStudent = await fetchCompletionStatuses(moodleUrl, token, courseId, studentIds, dbCourse.id, supabase)

  // Build and upsert records
  const now = new Date().toISOString()
  const activityRecords = buildActivityRecords(activities, studentIds, dbCourse.id, assignDueDates, quizDueDates, completionByStudent, now)

  console.log(`Preparing to upsert ${activityRecords.length} activity records`)

  const BATCH_SIZE = 500
  let activitiesCount = 0
  for (let i = 0; i < activityRecords.length; i += BATCH_SIZE) {
    const batch = activityRecords.slice(i, i + BATCH_SIZE)
    try {
      activitiesCount += await upsertStudentActivities(supabase, batch, batch.length)
    } catch (error) {
      console.error(`Error upserting activity batch ${i / BATCH_SIZE}:`, error)
    }
  }

  console.log(`Upserted ${activitiesCount} activity records`)
  return jsonResponse({ success: true, activitiesCount })
}

// --- Helper functions ---

async function fetchActivitiesFallback(
  moodleUrl: string,
  token: string,
  courseId: number
): Promise<unknown[]> {
  const activities: unknown[] = []

  try {
    const assignData = await callMoodleApi(moodleUrl, token, 'mod_assign_get_assignments', { 'courseids[0]': courseId })
    const assignments = assignData?.courses?.[0]?.assignments || []
    for (const assign of assignments) {
      const activityId = assign.cmid || assign.coursemodule || assign.id
      if (!activityId) continue
      activities.push({
        id: activityId,
        name: assign.name || `Assignment ${activityId}`,
        modname: 'assign',
        completiondata: null,
      })
    }
  } catch (err) {
    console.error(`Fallback assign fetch failed for course ${courseId}:`, err)
  }

  try {
    const quizData = await callMoodleApi(moodleUrl, token, 'mod_quiz_get_quizzes_by_courses', { 'courseids[0]': courseId })
    const quizzes = quizData?.quizzes || []
    for (const quiz of quizzes) {
      const activityId = quiz.coursemodule || quiz.cmid || quiz.id
      if (!activityId) continue
      activities.push({
        id: activityId,
        name: quiz.name || `Quiz ${activityId}`,
        modname: 'quiz',
        completiondata: null,
      })
    }
  } catch (err) {
    console.error(`Fallback quiz fetch failed for course ${courseId}:`, err)
  }

  try {
    const forumData = await callMoodleApi(moodleUrl, token, 'mod_forum_get_forums_by_courses', { 'courseids[0]': courseId })
    const forums = forumData?.forums || []
    for (const forum of forums) {
      const activityId = forum.cmid || forum.coursemodule || forum.id
      if (!activityId) continue
      activities.push({
        id: activityId,
        name: forum.name || `Forum ${activityId}`,
        modname: 'forum',
        completiondata: null,
      })
    }
  } catch (err) {
    console.error(`Fallback forum fetch failed for course ${courseId}:`, err)
  }

  const uniqueById = new Map<string, unknown>()
  for (const activity of activities) {
    uniqueById.set(String(activity.id), activity)
  }

  return Array.from(uniqueById.values())
}

function extractActivities(courseContents: unknown[]): unknown[] {
  const activities: unknown[] = []
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
  activities: unknown[]
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
  activities: unknown[]
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
  activities: unknown[],
  studentIds: string[],
  courseDbId: string,
  assignDueDates: Record<string, string | null>,
  quizDueDates: Record<string, string | null>,
  completionByStudent: Map<string, Map<string, { state: number; timecompleted: number | null }>>,
  now: string
): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = []

  for (const activity of activities) {
    let dueDate: string | null = null
    if (activity.modname === 'assign') dueDate = assignDueDates[String(activity.id)] || null
    else if (activity.modname === 'quiz') dueDate = quizDueDates[String(activity.id)] || null

    for (const studentId of studentIds) {
      const studentCompletion = completionByStudent.get(studentId)
      const actCompletion = studentCompletion?.get(String(activity.id))

      let status = 'pending'
      let completedAt: string | null = null

      if (actCompletion) {
        // Moodle completion states: 0=incomplete, 1=complete, 2=complete_pass, 3=complete_fail
        if (actCompletion.state >= 1) {
          status = actCompletion.state === 3 ? 'complete_fail' : 'completed'
          if (actCompletion.timecompleted && actCompletion.timecompleted > 0) {
            completedAt = new Date(actCompletion.timecompleted * 1000).toISOString()
          }
        }
      }

      const record: Record<string, unknown> = {
        student_id: studentId,
        course_id: courseDbId,
        moodle_activity_id: String(activity.id),
        activity_name: activity.name,
        activity_type: activity.modname,
        status,
        completed_at: completedAt,
        updated_at: now,
        // Auto-hide forum activities
        hidden: activity.modname === 'forum',
      }
      if (dueDate) record.due_date = dueDate
      records.push(record)
    }
  }

  return records
}

/**
 * Fetch per-student completion statuses for all activities in a course.
 * Uses core_completion_get_activities_completion_status when available.
 */
async function fetchCompletionStatuses(
  moodleUrl: string,
  token: string,
  courseId: number,
  studentIds: string[],
  courseDbId: string,
  supabase: AppSupabaseClient
): Promise<Map<string, Map<string, { state: number; timecompleted: number | null }>>> {
  const result = new Map<string, Map<string, { state: number; timecompleted: number | null }>>()

  const students = await listStudentsWithMoodleUserId(supabase, studentIds)

  if (!students?.length) return result

  for (const student of students) {
    const moodleUserId = parseInt(student.moodle_user_id, 10)
    if (isNaN(moodleUserId)) continue

    try {
      const completionData = await callMoodleApi(
        moodleUrl, token, 
        'core_completion_get_activities_completion_status',
        { courseid: courseId, userid: moodleUserId }
      )

      const activityMap = new Map<string, { state: number; timecompleted: number | null }>()
      if (completionData?.statuses) {
        for (const s of completionData.statuses) {
          activityMap.set(String(s.cmid), {
            state: s.state ?? 0,
            timecompleted: s.timecompleted ?? null,
          })
        }
      }
      result.set(student.id, activityMap)
    } catch (err) {
      console.warn(`Completion API failed for student ${moodleUserId} in course ${courseId}:`, err)
      // Fallback: no completion data for this student
    }
  }

  return result
}
