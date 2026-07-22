import { ApiError } from '../../http/mod.ts'
import { listAccessibleCourseIds } from '../../auth/mod.ts'
import type { AppSupabaseClient } from '../../db/mod.ts'
import {
  isStudentActivityPendingSubmission,
  isStudentActivityWeightedInGradebook,
} from '../student-activity-status.ts'
import type { BulkMessageRecipientDraft } from './repository.ts'

export interface BulkAudienceCourse {
  category: string | null
  courseId: string
  courseName: string
  enrollmentStatus: string
  lastAccess: string | null
  startDate: string | null
}

export interface BulkAudienceStudent {
  avatarUrl: string | null
  courses: BulkAudienceCourse[]
  currentRiskLevel: string | null
  email: string | null
  enrollmentStatus: string
  fullName: string
  id: string
  lastAccess: string | null
  moodleUserId: string
}

export interface BulkAudienceGrade {
  gradeFormatted: string | null
  gradePercentage: number | null
}

export interface BulkAudienceData {
  gradeLookup: Record<string, BulkAudienceGrade>
  pendingLookup: Record<string, number>
  students: BulkAudienceStudent[]
}

export interface BulkRecipientSelection {
  personalizedMessage?: string | null
  studentId: string
}

interface CourseRow {
  category: string | null
  id: string
  name: string
  start_date: string | null
}

interface StudentCourseRow {
  course_id: string
  enrollment_status: string | null
  last_access: string | null
  student_id: string
  students: {
    avatar_url: string | null
    current_risk_level: string | null
    email: string | null
    full_name: string
    id: string
    last_access: string | null
    moodle_user_id: string
  } | null
}

interface GradeRow {
  course_id: string
  grade_formatted: string | null
  grade_percentage: number | null
  student_id: string
}

interface ActivityRow {
  activity_type: string | null
  completed_at: string | null
  course_id: string
  grade: number | null
  grade_max: number | null
  graded_at: string | null
  percentage: number | null
  status: string | null
  student_id: string
  submitted_at: string | null
}

const QUERY_BATCH_SIZE = 50

export function buildStudentCourseKey(studentId: string, courseId: string): string {
  return `${studentId}:${courseId}`
}

function chunks<T>(values: T[], size = QUERY_BATCH_SIZE): T[][] {
  const unique = [...new Set(values)]
  const result: T[][] = []
  for (let index = 0; index < unique.length; index += size) {
    result.push(unique.slice(index, index + size))
  }
  return result
}

async function queryInBatches<T>(
  values: string[],
  query: (batch: string[]) => Promise<T[]>,
): Promise<T[]> {
  return (await Promise.all(chunks(values).map(query))).flat()
}

async function listCourses(
  db: AppSupabaseClient,
  courseIds: string[],
  moodleSiteId?: string,
): Promise<CourseRow[]> {
  return queryInBatches(courseIds, async (batch) => {
    let query = db
      .from('courses')
      .select('id, name, category, start_date')
      .in('id', batch)
    if (moodleSiteId) query = query.eq('moodle_site_id', moodleSiteId)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as CourseRow[]
  })
}

async function listStudentCourses(db: AppSupabaseClient, courseIds: string[]): Promise<StudentCourseRow[]> {
  return queryInBatches(courseIds, async (batch) => {
    const { data, error } = await db
      .from('student_courses')
      .select('student_id, course_id, enrollment_status, last_access, students(id, full_name, email, avatar_url, moodle_user_id, current_risk_level, last_access)')
      .in('course_id', batch)
    if (error) throw error
    return (data ?? []) as unknown as StudentCourseRow[]
  })
}

async function listGrades(db: AppSupabaseClient, courseIds: string[]): Promise<GradeRow[]> {
  return queryInBatches(courseIds, async (batch) => {
    const { data, error } = await db
      .from('student_course_grades')
      .select('student_id, course_id, grade_formatted, grade_percentage')
      .in('course_id', batch)
    if (error) throw error
    return (data ?? []) as GradeRow[]
  })
}

async function listActivities(db: AppSupabaseClient, courseIds: string[]): Promise<ActivityRow[]> {
  return queryInBatches(courseIds, async (batch) => {
    const { data, error } = await db
      .from('student_activities')
      .select('student_id, course_id, activity_type, grade, grade_max, percentage, submitted_at, completed_at, graded_at, status')
      .eq('hidden', false)
      .in('course_id', batch)
    if (error) throw error
    return (data ?? []) as ActivityRow[]
  })
}

function resolveEnrollmentStatus(statuses?: {
  all: Set<string>
  valid: Set<string>
}): string {
  if (!statuses) return 'inativo'
  const source = statuses.valid.size > 0 ? statuses.valid : statuses.all
  if (source.has('suspenso')) return 'suspenso'
  if (source.has('concluido')) return 'concluido'
  if (source.has('ativo')) return 'ativo'
  return 'inativo'
}

export async function listBulkAudience(
  db: AppSupabaseClient,
  actorId: string,
  moodleSiteId?: string,
  now = new Date(),
): Promise<BulkAudienceData> {
  const accessibleCourseIds = await listAccessibleCourseIds(db, actorId, 'tutor')
  if (accessibleCourseIds.length === 0) {
    return { gradeLookup: {}, pendingLookup: {}, students: [] }
  }

  const courseMap = new Map(
    (await listCourses(db, accessibleCourseIds, moodleSiteId)).map((course) => [course.id, course]),
  )
  const courseIds = [...courseMap.keys()]
  if (courseIds.length === 0) {
    return { gradeLookup: {}, pendingLookup: {}, students: [] }
  }

  const studentMap = new Map<string, BulkAudienceStudent>()
  const enrollmentStatuses = new Map<string, { all: Set<string>; valid: Set<string> }>()

  for (const enrollment of await listStudentCourses(db, courseIds)) {
    const student = enrollment.students
    if (!student) continue
    const course = courseMap.get(enrollment.course_id)
    const status = (enrollment.enrollment_status || 'ativo').toLowerCase()
    const validCourse = !course?.start_date || new Date(course.start_date) <= now
    const statuses = enrollmentStatuses.get(student.id) ?? { all: new Set<string>(), valid: new Set<string>() }
    statuses.all.add(status)
    if (validCourse) statuses.valid.add(status)
    enrollmentStatuses.set(student.id, statuses)

    const current = studentMap.get(student.id) ?? {
      avatarUrl: student.avatar_url,
      courses: [],
      currentRiskLevel: student.current_risk_level,
      email: student.email,
      enrollmentStatus: 'ativo',
      fullName: student.full_name,
      id: student.id,
      lastAccess: student.last_access,
      moodleUserId: student.moodle_user_id,
    }

    if (course && !current.courses.some((entry) => entry.courseId === course.id)) {
      current.courses.push({
        category: course.category,
        courseId: course.id,
        courseName: course.name,
        enrollmentStatus: status,
        lastAccess: enrollment.last_access,
        startDate: course.start_date,
      })
    }
    studentMap.set(student.id, current)
  }

  const students = [...studentMap.values()]
    .map((student) => ({
      ...student,
      courses: [...student.courses].sort((left, right) => left.courseName.localeCompare(right.courseName, 'pt-BR')),
      enrollmentStatus: resolveEnrollmentStatus(enrollmentStatuses.get(student.id)),
    }))
    .sort((left, right) => left.fullName.localeCompare(right.fullName, 'pt-BR'))

  const knownStudents = new Set(students.map((student) => student.id))
  const [grades, activities] = await Promise.all([
    listGrades(db, courseIds),
    listActivities(db, courseIds),
  ])

  const gradeLookup: Record<string, BulkAudienceGrade> = {}
  for (const grade of grades) {
    if (!knownStudents.has(grade.student_id)) continue
    gradeLookup[buildStudentCourseKey(grade.student_id, grade.course_id)] = {
      gradeFormatted: grade.grade_formatted,
      gradePercentage: grade.grade_percentage,
    }
  }

  const pendingLookup: Record<string, number> = {}
  for (const activity of activities) {
    if (!knownStudents.has(activity.student_id)
      || !isStudentActivityWeightedInGradebook(activity)
      || !isStudentActivityPendingSubmission(activity)) continue
    const key = buildStudentCourseKey(activity.student_id, activity.course_id)
    pendingLookup[key] = (pendingLookup[key] ?? 0) + 1
  }

  return { gradeLookup, pendingLookup, students }
}

export async function resolveAuthorizedRecipients(
  db: AppSupabaseClient,
  actorId: string,
  moodleSiteId: string,
  selections: BulkRecipientSelection[],
): Promise<BulkMessageRecipientDraft[]> {
  const audience = await listBulkAudience(db, actorId, moodleSiteId)
  const byStudentId = new Map(audience.students.map((student) => [student.id, student]))
  const uniqueSelections = new Map<string, BulkRecipientSelection>()
  for (const selection of selections) uniqueSelections.set(selection.studentId, selection)

  const inaccessibleStudentIds = [...uniqueSelections.keys()].filter((studentId) => !byStudentId.has(studentId))
  if (inaccessibleStudentIds.length > 0) {
    throw ApiError.unprocessable('Selected recipients are no longer eligible', {
      inaccessibleStudentIds,
    })
  }

  return [...uniqueSelections.values()].map((selection) => {
    const student = byStudentId.get(selection.studentId)
    if (!student) throw ApiError.unprocessable('Selected recipient is no longer eligible')
    return {
      moodleUserId: student.moodleUserId,
      personalizedMessage: selection.personalizedMessage?.trim() || null,
      studentId: student.id,
      studentName: student.fullName,
    }
  })
}
