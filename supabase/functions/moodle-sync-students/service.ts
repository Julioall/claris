import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { getCourseEnrolledUsers, getCourseSuspendedUserIds } from '../_shared/moodle/mod.ts'

const STAFF_ROLE_SHORTNAMES = new Set(['manager', 'editingteacher', 'teacher', 'coursecreator'])
const STUDENT_ROLE_SHORTNAMES = new Set(['student', 'aluno', 'estudante'])

function isSuspendedValue(value: unknown): boolean {
  if (value === true) return true
  if (value === 1) return true
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === '1' || normalized === 'true' || normalized === 'yes'
  }
  return false
}

function isCompletedValue(value: unknown): boolean {
  if (value === true) return true
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'completed' || normalized === 'concluido' || normalized === '1' || normalized === 'true'
  }
  if (typeof value === 'number') {
    return value === 1
  }
  return false
}

function isInactiveValue(value: unknown): boolean {
  if (value === false) return true
  if (value === 0) return true
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === '0' || normalized === 'false' || normalized === 'inactive' || normalized === 'inativo'
  }
  return false
}

function isStudentLikeUser(user: { roles?: { shortname?: string }[] }): boolean {
  const roleShortnames = (user.roles || [])
    .map((role) => String(role.shortname || '').toLowerCase())
    .filter(Boolean)

  if (roleShortnames.length === 0) return true

  if (roleShortnames.some((role) => STUDENT_ROLE_SHORTNAMES.has(role))) return true

  if (roleShortnames.every((role) => STAFF_ROLE_SHORTNAMES.has(role))) return false

  return true
}

function resolveEnrollmentStatus(args: {
  isMassSuspensionPreStartIgnored: boolean
  isSuspendedByOnlySuspended: boolean
  isSuspendedByPayload: boolean
  isCompleted: boolean
  isInactive: boolean
}): 'ativo' | 'suspenso' | 'concluido' | 'inativo' {
  const {
    isMassSuspensionPreStartIgnored,
    isSuspendedByOnlySuspended,
    isSuspendedByPayload,
    isCompleted,
    isInactive,
  } = args

  if (isMassSuspensionPreStartIgnored && isSuspendedByOnlySuspended) return 'inativo'
  if (isSuspendedByOnlySuspended || isSuspendedByPayload) return 'suspenso'
  if (isCompleted) return 'concluido'
  if (isInactive) return 'inativo'
  return 'ativo'
}

export async function syncStudents(moodleUrl: string, token: string, courseId: number): Promise<Response> {
  const supabase = createServiceClient()

  const { data: dbCourse } = await supabase
    .from('courses')
    .select('id, start_date')
    .eq('moodle_course_id', String(courseId))
    .maybeSingle()

  if (!dbCourse) return errorResponse('Course not found in database', 404)

  const [enrolledUsers, suspendedUserIds] = await Promise.all([
    getCourseEnrolledUsers(moodleUrl, token, courseId),
    getCourseSuspendedUserIds(moodleUrl, token, courseId),
  ])
  console.log(`Found ${enrolledUsers.length} enrolled users in course ${courseId}`)

  const usersWithoutRoles = enrolledUsers.filter((u) => !u.roles || u.roles.length === 0).length
  const students = enrolledUsers.filter((u) => isStudentLikeUser(u))
  console.log(`Found ${students.length} students in course ${courseId}`)
  console.log(
    `[moodle-sync-students] course=${courseId} enrolled_users=${enrolledUsers.length} users_without_roles=${usersWithoutRoles} inferred_students=${students.length}`
  )

  const suspendedStudentsInCourse = students.filter((student) => suspendedUserIds.has(student.id))
  const isCourseNotStarted = dbCourse.start_date ? new Date(dbCourse.start_date) > new Date() : false
  const isMassSuspensionPreStartIgnored =
    isCourseNotStarted &&
    students.length > 0 &&
    suspendedStudentsInCourse.length === students.length

  console.log(
    `[moodle-sync-students] course=${courseId} suspended_students=${suspendedStudentsInCourse.length} total_students=${students.length}`
  )

  if (isMassSuspensionPreStartIgnored) {
    console.log(
      `[moodle-sync-students] mass_suspension_pre_start_ignored course=${courseId} suspended_students=${suspendedStudentsInCourse.length} total_students=${students.length}`
    )
  }

  if (students.length === 0) {
    return jsonResponse({ success: true, students: [] })
  }

  const now = new Date().toISOString()
  let suspendedByStudentStatusCount = 0
  let suspendedByStudentFlagCount = 0
  let suspendedByEnrollmentStatusCount = 0
  let suspendedByEnrolledCourseFlagCount = 0
  let suspendedByOnlySuspendedCount = 0

  const studentsData = students.map((student) => {
    const courseEnrolment = student.enrolments?.find((e) => Number(e.courseid) === Number(courseId))
    const courseInfo = student.enrolledcourses?.find((c) => Number(c.id) === Number(courseId))

    const suspendedByStudentStatus = isSuspendedValue((student as { status?: unknown }).status)
    const suspendedByStudentFlag = isSuspendedValue((student as { suspended?: unknown }).suspended)
    const suspendedByEnrollmentStatus = isSuspendedValue(courseEnrolment?.status)
    const suspendedByEnrolledCourseFlag = isSuspendedValue(courseInfo?.suspended)

    const isSuspendedByPayload =
      suspendedByStudentStatus ||
      suspendedByStudentFlag ||
      suspendedByEnrollmentStatus ||
      suspendedByEnrolledCourseFlag

    const isSuspendedByOnlySuspended = suspendedUserIds.has(student.id) && !isMassSuspensionPreStartIgnored

    if (suspendedByStudentStatus) suspendedByStudentStatusCount++
    if (suspendedByStudentFlag) suspendedByStudentFlagCount++
    if (suspendedByEnrollmentStatus) suspendedByEnrollmentStatusCount++
    if (suspendedByEnrolledCourseFlag) suspendedByEnrolledCourseFlagCount++
    if (isSuspendedByOnlySuspended) suspendedByOnlySuspendedCount++

    const isCompleted =
      isCompletedValue((student as { completed?: unknown }).completed) ||
      isCompletedValue((student as { completionstatus?: unknown }).completionstatus)

    const isInactive =
      isInactiveValue((student as { active?: unknown }).active) ||
      isInactiveValue((student as { isactive?: unknown }).isactive)

    const enrollmentStatus = resolveEnrollmentStatus({
      isMassSuspensionPreStartIgnored,
      isSuspendedByOnlySuspended,
      isSuspendedByPayload,
      isCompleted,
      isInactive,
    })

    const lastCourseAccess = (student as any).lastcourseaccess
      ? new Date((student as any).lastcourseaccess * 1000).toISOString()
      : null

    return {
      moodle_user_id: String(student.id),
      full_name: student.fullname || `${student.firstname} ${student.lastname}`,
      email: student.email || null,
      avatar_url: student.profileimageurl || null,
      last_access: student.lastaccess ? new Date(student.lastaccess * 1000).toISOString() : null,
      updated_at: now,
      _enrollment_status: enrollmentStatus,
      _last_course_access: lastCourseAccess,
    }
  })

  const suspendedByFinalStatus = studentsData.filter((student) => student._enrollment_status === 'suspenso').length
  console.log(
    `[moodle-sync-students] course=${courseId} final_suspensos=${suspendedByFinalStatus} total_students=${studentsData.length}`
  )
  console.log(
    `[moodle-sync-students] course=${courseId} suspended_sources status=${suspendedByStudentStatusCount} suspended_flag=${suspendedByStudentFlagCount} enrolment_status=${suspendedByEnrollmentStatusCount} enrolledcourse_suspended=${suspendedByEnrolledCourseFlagCount} onlysuspended=${suspendedByOnlySuspendedCount}`
  )

  const studentsForUpsert = studentsData.map(({ _enrollment_status, _last_course_access, ...rest }) => rest)
  const { data: syncedStudents, error: upsertError } = await supabase
    .from('students')
    .upsert(studentsForUpsert, { onConflict: 'moodle_user_id', ignoreDuplicates: false })
    .select()

  if (upsertError) {
    console.error('Error upserting students:', upsertError)
    return errorResponse('Failed to sync students', 500)
  }

  // Link students to course
  if (syncedStudents?.length) {
    const studentDataMap = new Map(
      studentsData.map((s) => [s.moodle_user_id, { status: s._enrollment_status, lastCourseAccess: s._last_course_access }])
    )

    const currentMoodleUserIds = new Set(studentsData.map((s) => s.moodle_user_id))

    const { data: existingCourseLinks } = await supabase
      .from('student_courses')
      .select('student_id, students (moodle_user_id)')
      .eq('course_id', dbCourse.id)

    const inferredSuspendedLinks = (existingCourseLinks || [])
      .map((row: any) => {
        const moodleUserId = row?.students?.moodle_user_id ? String(row.students.moodle_user_id) : null
        if (!moodleUserId) return null
        if (currentMoodleUserIds.has(moodleUserId)) return null
        return {
          student_id: row.student_id,
          course_id: dbCourse.id,
          enrollment_status: 'suspenso',
          last_sync: now,
        }
      })
      .filter((row: any) => row !== null)

    if (inferredSuspendedLinks.length > 0 && studentsData.length > 0) {
      console.log(
        `[moodle-sync-students] course=${courseId} inferred_suspended_by_absence=${inferredSuspendedLinks.length}`
      )
    }

    const studentCourseLinks = syncedStudents.map((s: any) => {
      const data = studentDataMap.get(s.moodle_user_id)
      return {
        student_id: s.id,
        course_id: dbCourse.id,
        enrollment_status: data?.status || 'ativo',
        last_access: data?.lastCourseAccess || null,
        last_sync: now,
      }
    })

    const linksToUpsert =
      studentsData.length > 0
        ? [...studentCourseLinks, ...inferredSuspendedLinks]
        : studentCourseLinks

    const { error: linkError } = await supabase
      .from('student_courses')
      .upsert(linksToUpsert, { onConflict: 'student_id,course_id', ignoreDuplicates: false })

    if (linkError) console.error('Error linking students to course:', linkError)
  }

  await supabase.from('courses').update({ last_sync: now }).eq('id', dbCourse.id)

  return jsonResponse({ success: true, students: syncedStudents || [] })
}
