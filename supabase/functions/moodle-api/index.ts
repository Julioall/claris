import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createServiceClient, createAnonClient } from '../_shared/supabase.ts'
import {
  validateMoodleUrl,
  validatePositiveInteger,
  validateString,
  validateStringArray,
  parseNullableNumber,
  parseNullablePercentage,
} from '../_shared/validation.ts'
import {
  getMoodleToken,
  callMoodleApi,
  getSiteInfo,
  getUserCourses,
  getCategories,
  buildCategoryPath,
  getCourseEnrolledUsers,
} from '../_shared/moodle-client.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const body = await req.json()
    const { action, moodleUrl, username, password, token, userId, courseId, service, selectedCourseIds } = body

    console.log(`Moodle API action: ${action}`)

    // --- Input Validation ---
    if (!validateString(action, 64)) return errorResponse('Invalid or missing action')
    if (moodleUrl !== undefined && !validateMoodleUrl(moodleUrl)) return errorResponse('Invalid Moodle URL format.')
    if (userId !== undefined && !validatePositiveInteger(userId)) return errorResponse('Invalid userId.')
    if (courseId !== undefined && !validatePositiveInteger(courseId)) return errorResponse('Invalid courseId.')
    if (username !== undefined && !validateString(username, 255)) return errorResponse('Invalid username.')
    if (password !== undefined && !validateString(password, 1024)) return errorResponse('Invalid password.')
    if (token !== undefined && !validateString(token, 512)) return errorResponse('Invalid token.')
    if (service !== undefined && !validateString(service, 128)) return errorResponse('Invalid service name.')
    if (selectedCourseIds !== undefined && !validateStringArray(selectedCourseIds)) return errorResponse('Invalid selectedCourseIds.')

    const supabase = createServiceClient()

    switch (action) {
      case 'login':
        return await handleLogin(supabase, body)

      case 'sync_courses':
        return await handleSyncCourses(supabase, body)

      case 'sync_students':
        return await handleSyncStudents(supabase, body)

      case 'sync_activities':
        return await handleSyncActivities(supabase, body)

      case 'sync_grades':
        return await handleSyncGrades(supabase, body)

      case 'debug_grades':
        return await handleDebugGrades(body)

      case 'link_selected_courses':
        return await handleLinkSelectedCourses(supabase, body)

      case 'send_message':
        return await handleSendMessage(body)

      case 'get_conversations':
        return await handleGetConversations(body)

      case 'get_messages':
        return await handleGetMessages(body)

      default:
        return errorResponse('Invalid action')
    }
  } catch (error: unknown) {
    console.error('Error in moodle-api function:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', 500)
  }
})

// ═══════════════════════════════════════════════════════════════════
// ACTION HANDLERS
// ═══════════════════════════════════════════════════════════════════

async function handleLogin(supabase: any, body: any): Promise<Response> {
  const { moodleUrl, username, password, service } = body
  if (!moodleUrl || !username || !password) {
    return errorResponse('Missing required fields: moodleUrl, username, password')
  }

  const tokenResponse = await getMoodleToken(moodleUrl, username, password, service || 'moodle_mobile_app')

  const moodleUnavailable =
    tokenResponse.error &&
    ['service_unavailable', 'network_error', 'parse_error'].includes(tokenResponse.errorcode || '')

  if (moodleUnavailable) {
    return await handleFallbackLogin(supabase, username, password, tokenResponse)
  }

  if (tokenResponse.error || !tokenResponse.token) {
    return jsonResponse(
      { error: tokenResponse.error || 'Authentication failed', errorcode: tokenResponse.errorcode },
      401
    )
  }

  const siteInfo = await getSiteInfo(moodleUrl, tokenResponse.token)
  const authEmail = `moodle_${siteInfo.userid}@moodle.local`
  const anonClient = createAnonClient()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  const { data: existingUser } = await supabase
    .from('users')
    .select('*')
    .eq('moodle_user_id', String(siteInfo.userid))
    .single()

  const userData = {
    moodle_user_id: String(siteInfo.userid),
    moodle_username: siteInfo.username,
    full_name: siteInfo.fullname || `${siteInfo.firstname} ${siteInfo.lastname}`,
    email: siteInfo.email || null,
    avatar_url: siteInfo.profileimageurl || null,
    last_login: new Date().toISOString(),
    last_sync: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  let user
  let session

  if (existingUser) {
    let signInResult = await anonClient.auth.signInWithPassword({ email: authEmail, password })

    if (signInResult.error) {
      const createResult = await supabase.auth.admin.createUser({
        id: existingUser.id,
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: { moodle_user_id: String(siteInfo.userid) },
      })

      if (createResult.error) {
        await supabase.auth.admin.updateUserById(existingUser.id, { password })
      }

      signInResult = await anonClient.auth.signInWithPassword({ email: authEmail, password })

      if (signInResult.error) {
        console.error('Failed to sign in after auth user setup:', signInResult.error)
        throw new Error('Failed to create authentication session')
      }
    }

    session = signInResult.data.session

    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(userData)
      .eq('id', existingUser.id)
      .select()
      .single()

    if (updateError) throw updateError
    user = updatedUser
  } else {
    const { data: newAuthUser, error: createAuthError } = await supabase.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: { moodle_user_id: String(siteInfo.userid) },
    })

    if (createAuthError) throw createAuthError

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({ ...userData, id: newAuthUser.user.id })
      .select()
      .single()

    if (insertError) throw insertError
    user = newUser

    const signInResult = await anonClient.auth.signInWithPassword({ email: authEmail, password })
    if (signInResult.error) throw signInResult.error
    session = signInResult.data.session
  }

  return jsonResponse({
    success: true,
    user,
    moodleToken: tokenResponse.token,
    moodleUserId: siteInfo.userid,
    session: { access_token: session.access_token, refresh_token: session.refresh_token },
  })
}

async function handleFallbackLogin(
  supabase: any,
  username: string,
  password: string,
  tokenResponse: any
): Promise<Response> {
  console.log('Moodle unavailable, attempting fallback login...')

  const { data: fallbackUser } = await supabase
    .from('users')
    .select('*')
    .eq('moodle_username', username)
    .single()

  if (fallbackUser) {
    const fallbackEmail = `moodle_${fallbackUser.moodle_user_id}@moodle.local`
    const anonClient = createAnonClient()

    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email: fallbackEmail,
      password,
    })

    if (!signInError && signInData.session) {
      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', fallbackUser.id)

      console.log('Fallback login successful for user:', fallbackUser.full_name)

      return jsonResponse({
        success: true,
        user: fallbackUser,
        moodleToken: null,
        moodleUserId: parseInt(fallbackUser.moodle_user_id, 10),
        offlineMode: true,
        session: {
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
        },
      })
    }

    console.log('Fallback sign-in failed:', signInError?.message)
  }

  return jsonResponse(
    { error: tokenResponse.error || 'Authentication failed', errorcode: tokenResponse.errorcode },
    401
  )
}

// ─── Sync Courses ─────────────────────────────────────────────────

async function handleSyncCourses(supabase: any, body: any): Promise<Response> {
  const { moodleUrl, token, userId } = body
  if (!moodleUrl || !token || !userId) {
    return errorResponse('Missing required fields: moodleUrl, token, userId')
  }

  const { data: dbUser } = await supabase
    .from('users')
    .select('id')
    .eq('moodle_user_id', String(userId))
    .maybeSingle()

  if (!dbUser) return errorResponse('User not found in database', 404)

  const moodleCourses = await getUserCourses(moodleUrl, token, userId)
  console.log(`Found ${moodleCourses.length} courses for user ${userId}`)

  const categories = await getCategories(moodleUrl, token)
  console.log(`Found ${categories.length} categories`)

  const now = new Date().toISOString()

  const coursesData = moodleCourses.map((course) => {
    let categoryName: string | null = null
    if (course.category && categories.length > 0) {
      categoryName = buildCategoryPath(course.category, categories)
    }
    if (!categoryName && course.category) {
      categoryName = String(course.category)
    }

    return {
      moodle_course_id: String(course.id),
      name: course.fullname,
      short_name: course.shortname,
      category: categoryName,
      start_date: course.startdate ? new Date(course.startdate * 1000).toISOString() : null,
      end_date: course.enddate ? new Date(course.enddate * 1000).toISOString() : null,
      last_sync: now,
      updated_at: now,
    }
  })

  const { data: syncedCourses, error: upsertError } = await supabase
    .from('courses')
    .upsert(coursesData, { onConflict: 'moodle_course_id', ignoreDuplicates: false })
    .select()

  if (upsertError) {
    console.error('Error upserting courses:', upsertError)
    return errorResponse('Failed to sync courses', 500)
  }

  return jsonResponse({ success: true, courses: syncedCourses || [] })
}

// ─── Sync Students ────────────────────────────────────────────────

async function handleSyncStudents(supabase: any, body: any): Promise<Response> {
  const { moodleUrl, token, courseId } = body
  if (!moodleUrl || !token || !courseId) {
    return errorResponse('Missing required fields: moodleUrl, token, courseId')
  }

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

// ─── Sync Activities ──────────────────────────────────────────────

async function handleSyncActivities(supabase: any, body: any): Promise<Response> {
  const { moodleUrl, token, courseId } = body
  if (!moodleUrl || !token || !courseId) {
    return errorResponse('Missing required fields: moodleUrl, token, courseId')
  }

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

  // Extract only quiz, assign, and forum activities
  const ALLOWED_ACTIVITY_TYPES = ['quiz', 'assign', 'forum']
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

  console.log(`Found ${activities.length} activities (quiz/assign/forum) in course ${courseId}`)
  if (activities.length === 0) return jsonResponse({ success: true, activitiesCount: 0 })

  // Fetch assignment due dates
  const assignActivities = activities.filter((a) => a.modname === 'assign')
  const assignDueDates: Record<string, string | null> = {}

  if (assignActivities.length > 0) {
    try {
      const assignData = await callMoodleApi(moodleUrl, token, 'mod_assign_get_assignments', { 'courseids[0]': courseId })
      if (assignData?.courses?.[0]?.assignments) {
        for (const assignment of assignData.courses[0].assignments) {
          if (assignment.cmid && assignment.duedate && assignment.duedate > 0) {
            assignDueDates[String(assignment.cmid)] = new Date(assignment.duedate * 1000).toISOString()
          }
        }
      }
      console.log(`Fetched due dates for ${Object.keys(assignDueDates).length} assignments`)
    } catch (err) {
      console.error('Error fetching assignment details:', err)
    }
  }

  // Fetch quiz due dates
  const quizActivities = activities.filter((a) => a.modname === 'quiz')
  const quizDueDates: Record<string, string | null> = {}
  if (quizActivities.length > 0) {
    try {
      const quizData = await callMoodleApi(moodleUrl, token, 'mod_quiz_get_quizzes_by_courses', { 'courseids[0]': courseId })
      if (quizData?.quizzes) {
        for (const q of quizData.quizzes) {
          if (q.coursemodule && q.timeclose && q.timeclose > 0) {
            quizDueDates[String(q.coursemodule)] = new Date(q.timeclose * 1000).toISOString()
          }
        }
      }
    } catch (err) {
      console.error('Error fetching quiz details:', err)
    }
  }

  // Build activity records
  const now = new Date().toISOString()
  const activityRecords: any[] = []

  for (const activity of activities) {
    let dueDate: string | null = null
    if (activity.modname === 'assign') dueDate = assignDueDates[String(activity.id)] || null
    else if (activity.modname === 'quiz') dueDate = quizDueDates[String(activity.id)] || null

    for (const studentId of studentIds) {
      const record: any = {
        student_id: studentId,
        course_id: dbCourse.id,
        moodle_activity_id: String(activity.id),
        activity_name: activity.name,
        activity_type: activity.modname,
        status: activity.completiondata?.state === 1 || activity.completiondata?.state === 2 ? 'completed' : 'pending',
        updated_at: now,
      }
      if (dueDate) record.due_date = dueDate
      activityRecords.push(record)
    }
  }

  console.log(`Preparing to upsert ${activityRecords.length} activity records`)

  // Batch upsert
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

// ─── Sync Grades ──────────────────────────────────────────────────

async function handleSyncGrades(supabase: any, body: any): Promise<Response> {
  const { moodleUrl, token, courseId } = body
  if (!moodleUrl || !token || !courseId) {
    return errorResponse('Missing required fields: moodleUrl, token, courseId')
  }

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

// ─── Debug Grades ─────────────────────────────────────────────────

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

// ─── Link Selected Courses ────────────────────────────────────────

async function handleLinkSelectedCourses(supabase: any, body: any): Promise<Response> {
  const { userId, selectedCourseIds } = body
  if (!userId || !selectedCourseIds || !Array.isArray(selectedCourseIds)) {
    return errorResponse('Missing required fields: userId, selectedCourseIds')
  }

  const { data: linkUser } = await supabase
    .from('users')
    .select('id')
    .eq('moodle_user_id', String(userId))
    .maybeSingle()

  if (!linkUser) return errorResponse('User not found', 404)

  const { data: existingLinks } = await supabase
    .from('user_courses')
    .select('course_id')
    .eq('user_id', linkUser.id)

  const existingCourseIds = new Set(existingLinks?.map((l: any) => l.course_id) || [])
  const selectedSet = new Set(selectedCourseIds as string[])

  // Remove unselected
  const toRemove = [...existingCourseIds].filter((id) => !selectedSet.has(id))
  if (toRemove.length > 0) {
    await supabase.from('user_courses').delete().eq('user_id', linkUser.id).in('course_id', toRemove)
  }

  // Add newly selected
  const toAdd = (selectedCourseIds as string[]).filter((id) => !existingCourseIds.has(id))
  if (toAdd.length > 0) {
    const links = toAdd.map((course_id) => ({ user_id: linkUser.id, course_id, role: 'tutor' }))
    const BATCH = 100
    for (let i = 0; i < links.length; i += BATCH) {
      await supabase
        .from('user_courses')
        .upsert(links.slice(i, i + BATCH), { onConflict: 'user_id,course_id', ignoreDuplicates: true })
    }
  }

  await supabase.from('users').update({ last_sync: new Date().toISOString() }).eq('id', linkUser.id)

  console.log(`Linked ${toAdd.length} courses, removed ${toRemove.length} for user ${linkUser.id}`)
  return jsonResponse({ success: true, added: toAdd.length, removed: toRemove.length })
}

// ─── Messaging ────────────────────────────────────────────────────

async function handleSendMessage(body: any): Promise<Response> {
  const { moodleUrl, token, moodle_user_id: targetMoodleUserId, message: messageText } = body
  if (!targetMoodleUserId || !messageText) {
    return errorResponse('moodle_user_id and message are required')
  }

  console.log(`Sending message to Moodle user ${targetMoodleUserId}`)

  try {
    const result = await callMoodleApi(moodleUrl, token, 'core_message_send_instant_messages', {
      'messages[0][touserid]': Number(targetMoodleUserId),
      'messages[0][text]': String(messageText),
      'messages[0][textformat]': 0,
    })

    const msgResult = Array.isArray(result) ? result[0] : result
    if (msgResult?.errormessage) return errorResponse(msgResult.errormessage)

    return jsonResponse({ success: true, message_id: msgResult?.msgid })
  } catch (err) {
    console.error('Error sending message:', err)
    return errorResponse(
      err instanceof Error ? err.message : 'Failed to send message.',
      500
    )
  }
}

async function handleGetConversations(body: any): Promise<Response> {
  const { moodleUrl, token } = body
  console.log('Fetching conversations from Moodle')

  try {
    const siteInfo = await getSiteInfo(moodleUrl, token)
    const result = await callMoodleApi(moodleUrl, token, 'core_message_get_conversations', {
      userid: siteInfo.userid,
      type: 1,
      limitnum: 50,
    })

    const conversations = (result?.conversations || []).map((conv: any) => ({
      id: conv.id,
      members: (conv.members || []).map((m: any) => ({
        id: m.id,
        fullname: m.fullname,
        profileimageurl: m.profileimageurl,
      })),
      messages: (conv.messages || []).map((msg: any) => ({
        id: msg.id,
        text: msg.text,
        timecreated: msg.timecreated,
        useridfrom: msg.useridfrom,
      })),
      unreadcount: conv.unreadcount || 0,
    }))

    return jsonResponse({ conversations, current_user_id: siteInfo.userid })
  } catch (err) {
    console.error('Error fetching conversations:', err)
    return errorResponse(
      err instanceof Error ? err.message : 'Failed to fetch conversations.',
      500
    )
  }
}

async function handleGetMessages(body: any): Promise<Response> {
  const { moodleUrl, token, moodle_user_id: otherUserId, limit_num: limitNum } = body
  if (!otherUserId) return errorResponse('moodle_user_id is required')

  console.log(`Fetching messages with Moodle user ${otherUserId}`)

  try {
    const siteInfo = await getSiteInfo(moodleUrl, token)
    const apiUrl = `${moodleUrl}/webservice/rest/server.php`
    const formData = new URLSearchParams({
      wstoken: token,
      wsfunction: 'core_message_get_conversation_between_users',
      moodlewsrestformat: 'json',
      userid: String(siteInfo.userid),
      otheruserid: String(Number(otherUserId)),
      includecontactrequests: '0',
      includeprivacyinfo: '0',
      messagelimit: String(Number(limitNum) || 50),
      messageoffset: '0',
      newestmessagesfirst: '1',
    })

    const convResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    })
    const convResult = await convResponse.json()

    if (convResult.exception) throw new Error(convResult.message || 'Moodle API error')

    const messages = (convResult?.messages || []).map((msg: any) => ({
      id: msg.id,
      text: msg.text,
      timecreated: msg.timecreated,
      useridfrom: msg.useridfrom,
    }))

    return jsonResponse({
      messages,
      current_user_id: siteInfo.userid,
      conversation_id: convResult?.id,
    })
  } catch (err) {
    console.error('Error fetching messages:', err)
    return errorResponse(err instanceof Error ? err.message : 'Failed to fetch messages.', 500)
  }
}
