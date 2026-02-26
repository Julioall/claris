import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { getCourseEnrolledUsers } from '../_shared/moodle/mod.ts'

export async function syncStudents(moodleUrl: string, token: string, courseId: number): Promise<Response> {
  const supabase = createServiceClient()

  const { data: dbCourse } = await supabase
    .from('courses')
    .select('id')
    .eq('moodle_course_id', String(courseId))
    .maybeSingle()

  if (!dbCourse) return errorResponse('Course not found in database', 404)

  const enrolledUsers = await getCourseEnrolledUsers(moodleUrl, token, courseId)
  console.log(`Found ${enrolledUsers.length} enrolled users in course ${courseId}`)

  const students = enrolledUsers.filter((u) => u.roles?.some((r) => r.shortname === 'student'))
  console.log(`Found ${students.length} students in course ${courseId}`)

  if (students.length === 0) {
    return jsonResponse({ success: true, students: [] })
  }

  const now = new Date().toISOString()
  const studentsData = students.map((student) => {
    let enrollmentStatus = 'ativo'

    if ((student as any).status === 1) enrollmentStatus = 'suspenso'
    if (student.suspended === true) enrollmentStatus = 'suspenso'

    if (student.enrolments?.length) {
      const courseEnrolment = student.enrolments.find((e) => e.courseid === courseId)
      if (courseEnrolment?.status === 1) enrollmentStatus = 'suspenso'
    }

    if (student.enrolledcourses?.length) {
      const courseInfo = student.enrolledcourses.find((c) => c.id === courseId)
      if (courseInfo?.suspended) enrollmentStatus = 'suspenso'
    }

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

    const { error: linkError } = await supabase
      .from('student_courses')
      .upsert(studentCourseLinks, { onConflict: 'student_id,course_id', ignoreDuplicates: false })

    if (linkError) console.error('Error linking students to course:', linkError)
  }

  await supabase.from('courses').update({ last_sync: now }).eq('id', dbCourse.id)

  return jsonResponse({ success: true, students: syncedStudents || [] })
}
