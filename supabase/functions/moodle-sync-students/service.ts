import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import {
  findCourseByMoodleCourseId,
  insertStudentSyncSnapshots,
  listExistingCourseStudentLinks,
  touchCourseLastSync,
  upsertStudentCourseLinks,
  upsertStudents,
} from '../_shared/domain/moodle-sync/repository.ts'
import { refreshDashboardCourseActivityAggregates } from '../_shared/domain/dashboard-activity-aggregates.ts'
import { getCourseEnrolledUsers, getCourseSuspendedUserIds, getUserProfilesByIds } from '../_shared/moodle/mod.ts'

const STAFF_ROLE_SHORTNAMES = new Set(['manager', 'editingteacher', 'teacher', 'coursecreator'])
const STUDENT_ROLE_SHORTNAMES = new Set(['student', 'aluno', 'estudante'])
const MOBILE_CUSTOM_FIELD_KEYS = new Set([
  'celular',
  'telefonecelular',
  'telefone_celular',
  'mobile',
  'mobilephone',
  'mobile_phone',
  'whatsapp',
])
const PHONE_CUSTOM_FIELD_KEYS = new Set([
  'telefone',
  'telefonefixo',
  'telefone_fixo',
  'phone',
  'phone1',
  'phone2',
])
const CITY_CUSTOM_FIELD_KEYS = new Set([
  'cidade',
  'municipio',
  'city',
  'town',
])
const INVALID_CITY_VALUES = new Set([
  'brasileira',
  'brasileiro',
  'brasil',
])

function normalizeCustomFieldKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeComparableText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isUsableCity(value: string | null): value is string {
  if (!value) return false
  const comparable = normalizeComparableText(value)
  if (!comparable) return false
  return !INVALID_CITY_VALUES.has(comparable)
}

function getCustomFieldValue(
  customfields: { shortname?: string; type?: string; name?: string; value?: string }[] | undefined,
  allowedKeys: Set<string>,
): string | null {
  if (!Array.isArray(customfields) || customfields.length === 0) return null

  for (const field of customfields) {
    const keyCandidates = [field.shortname, field.type, field.name]
      .filter((key): key is string => typeof key === 'string' && key.trim().length > 0)
      .map(normalizeCustomFieldKey)

    if (!keyCandidates.some((key) => allowedKeys.has(key))) continue

    const value = normalizePhone(field.value)
    if (value) return value
  }

  return null
}

function resolveStudentCity(student: {
  city?: string
  customfields?: { shortname?: string; type?: string; name?: string; value?: string }[]
}, fallbackProfile: {
  city?: string
  customfields?: { shortname?: string; type?: string; name?: string; value?: string }[]
} | undefined): string | null {
  const mergedCustomFields = [
    ...(Array.isArray(student.customfields) ? student.customfields : []),
    ...(Array.isArray(fallbackProfile?.customfields) ? fallbackProfile.customfields : []),
  ]

  const customCity = getCustomFieldValue(mergedCustomFields, CITY_CUSTOM_FIELD_KEYS)
  if (isUsableCity(customCity)) return customCity

  const primaryCity = normalizeOptionalText(student.city)
  if (isUsableCity(primaryCity)) return primaryCity

  const fallbackCity = normalizeOptionalText(fallbackProfile?.city)
  if (isUsableCity(fallbackCity)) return fallbackCity

  return null
}

function resolveStudentPhones(student: {
  phone1?: string
  phone2?: string
  customfields?: { shortname?: string; type?: string; name?: string; value?: string }[]
}): {
  phone: string | null
  phone_number: string | null
  mobile_phone: string | null
} {
  const mobilePhoneFromMoodle = normalizePhone(student.phone2)
  const phoneFromMoodle = normalizePhone(student.phone1)

  const customMobilePhone = getCustomFieldValue(student.customfields, MOBILE_CUSTOM_FIELD_KEYS)
  const customPhone = getCustomFieldValue(student.customfields, PHONE_CUSTOM_FIELD_KEYS)

  const mobilePhone = mobilePhoneFromMoodle || customMobilePhone || customPhone || phoneFromMoodle || null
  const phone = phoneFromMoodle || customPhone || customMobilePhone || mobilePhoneFromMoodle || null

  return {
    phone,
    phone_number: mobilePhone || phone,
    mobile_phone: mobilePhone,
  }
}

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

function isNotCurrentValue(value: unknown): boolean {
  if (typeof value !== 'string') return false

  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  return (
    normalized === 'nao atualmente' ||
    normalized === 'not current' ||
    normalized === 'not_current' ||
    normalized === 'notcurrently'
  )
}

function isActiveValue(value: unknown): boolean {
  if (value === true) return true
  if (value === 1) return true
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === '1' || normalized === 'true' || normalized === 'active' || normalized === 'ativo'
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
  isNotCurrent: boolean
  isExplicitlyActive: boolean
  hasRecentCourseAccess: boolean
}): 'ativo' | 'suspenso' | 'concluido' | 'inativo' {
  const {
    isMassSuspensionPreStartIgnored,
    isSuspendedByOnlySuspended,
    isSuspendedByPayload,
    isCompleted,
    isInactive,
    isNotCurrent,
    isExplicitlyActive,
    hasRecentCourseAccess,
  } = args

  if (isNotCurrent) return 'inativo'
  if (isExplicitlyActive && !isSuspendedByPayload) return 'ativo'
  if (isMassSuspensionPreStartIgnored && isSuspendedByOnlySuspended) return 'inativo'
  // A student who accessed the course very recently is demonstrably active.
  // The weaker isSuspendedByOnlySuspended signal (from the Moodle enrolled-users
  // API, which can have false positives) must not override this. Only explicit
  // suspension flags in the payload (isSuspendedByPayload) are strong enough to
  // mark a recently-active student as suspended.
  if (hasRecentCourseAccess && !isSuspendedByPayload) return 'ativo'
  if (isSuspendedByOnlySuspended || isSuspendedByPayload) return 'suspenso'
  if (isCompleted) return 'concluido'
  if (isInactive) return 'inativo'
  return 'ativo'
}

export async function syncStudents(moodleUrl: string, token: string, courseId: number, moodleSource: string): Promise<Response> {
  const supabase = createServiceClient()

  const dbCourse = await findCourseByMoodleCourseId(supabase, String(courseId), moodleSource)

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
  // Protect against mass false-positive suspensions: if ALL enrolled students appear in
  // the suspended list, treat it as a sync artefact regardless of course start date.
  // Real individual suspensions are still caught via explicit payload signals (user.suspended etc.).
  const isMassSuspensionPreStartIgnored =
    students.length > 0 &&
    suspendedStudentsInCourse.length === students.length

  console.log(
    `[moodle-sync-students] course=${courseId} suspended_students=${suspendedStudentsInCourse.length} total_students=${students.length}`
  )

  if (isMassSuspensionPreStartIgnored) {
    console.log(
      `[moodle-sync-students] mass_suspension_ignored course=${courseId} suspended_students=${suspendedStudentsInCourse.length} total_students=${students.length} course_not_started=${isCourseNotStarted}`
    )
  }

  if (students.length === 0) {
    await refreshDashboardAggregatesForCourse(supabase, dbCourse.id)
    return jsonResponse({ success: true, students: [] })
  }

  const studentIds = students
    .map((student) => Number(student.id))
    .filter((id): id is number => Number.isFinite(id) && id > 0)

  const profilesById = await getUserProfilesByIds(moodleUrl, token, studentIds)

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

    const isNotCurrent =
      isNotCurrentValue((student as { status?: unknown }).status) ||
      isNotCurrentValue((student as { enrollmentstatus?: unknown }).enrollmentstatus) ||
      isNotCurrentValue(courseEnrolment?.name)

    const isActiveByEnrollmentStatus =
      courseEnrolment?.status === 0 ||
      String(courseEnrolment?.status ?? '').trim() === '0'

    const isActiveByFlag =
      isActiveValue((student as { active?: unknown }).active) ||
      isActiveValue((student as { isactive?: unknown }).isactive)

    const isExplicitlyActive = isActiveByEnrollmentStatus || isActiveByFlag

    const suspendedByStrongPayload =
      suspendedByStudentStatus ||
      suspendedByStudentFlag ||
      suspendedByEnrolledCourseFlag

    const isSuspendedByPayload =
      suspendedByStrongPayload ||
      (suspendedByEnrollmentStatus && !isNotCurrent)

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

    const studentWithExtras = student as { lastcourseaccess?: number }
    const lastCourseAccessTimestamp = studentWithExtras.lastcourseaccess ?? 0
    const lastCourseAccess = lastCourseAccessTimestamp
      ? new Date(lastCourseAccessTimestamp * 1000).toISOString()
      : null

    // A student who accessed the course within the last 7 days is demonstrably
    // active. 7 days matches the default "atencao" risk threshold (see the
    // compute_student_risk DB function). Keep this value in sync with that
    // threshold if it ever becomes user-configurable.
    const RECENT_ACCESS_THRESHOLD_SECONDS = 7 * 24 * 60 * 60
    const hasRecentCourseAccess =
      lastCourseAccessTimestamp > 0 &&
      Date.now() / 1000 - lastCourseAccessTimestamp < RECENT_ACCESS_THRESHOLD_SECONDS

    const enrollmentStatus = resolveEnrollmentStatus({
      isMassSuspensionPreStartIgnored,
      isSuspendedByOnlySuspended,
      isSuspendedByPayload,
      isCompleted,
      isInactive,
      isNotCurrent,
      isExplicitlyActive,
      hasRecentCourseAccess,
    })

    const fallbackProfile = profilesById.get(Number(student.id))
    const city = resolveStudentCity(student, fallbackProfile)
    const phoneSource = {
      phone1: student.phone1 ?? fallbackProfile?.phone1,
      phone2: student.phone2 ?? fallbackProfile?.phone2,
      customfields: Array.isArray(student.customfields) && student.customfields.length > 0
        ? student.customfields
        : fallbackProfile?.customfields,
    }

    const { phone, phone_number, mobile_phone } = resolveStudentPhones(phoneSource)

    return {
      moodle_source: moodleSource,
      moodle_user_id: String(student.id),
      full_name: student.fullname || `${student.firstname} ${student.lastname}`,
      email: student.email || null,
      city,
      phone,
      phone_number,
      mobile_phone,
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
  let syncedStudents
  try {
    syncedStudents = await upsertStudents(supabase, studentsForUpsert)
  } catch (upsertError) {
    console.error('Error upserting students:', upsertError)
    return errorResponse('Failed to sync students', 500)
  }

  // Link students to course
  if (syncedStudents?.length) {
    const studentDataMap = new Map(
      studentsData.map((s) => [s.moodle_user_id, { status: s._enrollment_status, lastCourseAccess: s._last_course_access }])
    )

    const currentMoodleUserIds = new Set(studentsData.map((s) => s.moodle_user_id))

    const existingCourseLinks = await listExistingCourseStudentLinks(supabase, dbCourse.id)

    const inferredSuspendedLinks = existingCourseLinks
      .map((row) => {
        const moodleUserId = row.moodle_user_id ? String(row.moodle_user_id) : null
        if (!moodleUserId) return null
        if (currentMoodleUserIds.has(moodleUserId)) return null
        const moodleUserIdNumber = Number(moodleUserId)
        if (!Number.isFinite(moodleUserIdNumber) || !suspendedUserIds.has(moodleUserIdNumber)) return null
        return {
          student_id: row.student_id,
          course_id: dbCourse.id,
          enrollment_status: 'suspenso',
          last_sync: now,
        }
      })
      .filter((row) => row !== null)

    if (inferredSuspendedLinks.length > 0 && studentsData.length > 0) {
      console.log(
        `[moodle-sync-students] course=${courseId} inferred_suspended_by_absence=${inferredSuspendedLinks.length}`
      )
    }

    const studentCourseLinks = syncedStudents.map((s) => {
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

    try {
      await upsertStudentCourseLinks(supabase, linksToUpsert)
    } catch (linkError) {
      console.error('Error linking students to course:', linkError)
    }

    // -----------------------------------------------------------------------
    // Record sync snapshots (one per student per day)
    // Fetch pending/overdue activity counts for all synced students in one query.
    // -----------------------------------------------------------------------
    try {
      const syncedStudentIds = syncedStudents.map((s) => s.id)
      const nowDate = new Date()

      // Bulk fetch activity statuses for the course
      const { data: activityRows, error: activityError } = await supabase
        .from('student_activities')
        .select('student_id, due_date, completed_at, submitted_at')
        .eq('course_id', dbCourse.id)
        .in('student_id', syncedStudentIds)

      if (activityError) {
        console.error('[moodle-sync-students] Failed to fetch activities for snapshot:', activityError)
      }

      // Aggregate per student
      type ActivityCounts = { pending: number; overdue: number }
      const activityCountsByStudent = new Map<string, ActivityCounts>()
      for (const row of activityRows ?? []) {
        const sid = row.student_id
        if (!activityCountsByStudent.has(sid)) {
          activityCountsByStudent.set(sid, { pending: 0, overdue: 0 })
        }
        const counts = activityCountsByStudent.get(sid)!
        const isDone = Boolean(row.completed_at || row.submitted_at)
        if (!isDone) {
          counts.pending++
          if (row.due_date && new Date(row.due_date) < nowDate) {
            counts.overdue++
          }
        }
      }

      const snapshots = syncedStudents.map((s) => {
        const data = studentDataMap.get(s.moodle_user_id)
        const counts = activityCountsByStudent.get(s.id) ?? { pending: 0, overdue: 0 }
        const lastAccessIso = data?.lastCourseAccess ?? s.last_access ?? null
        const daysSinceAccess = lastAccessIso
          ? Math.floor((nowDate.getTime() - new Date(lastAccessIso).getTime()) / 86400000)
          : null
        return {
          student_id: s.id,
          course_id: dbCourse.id,
          sync_date: nowDate.toISOString().split('T')[0],
          synced_at: now,
          risk_level: s.current_risk_level ?? 'normal',
          enrollment_status: data?.status ?? 'ativo',
          last_access: lastAccessIso,
          days_since_access: daysSinceAccess,
          pending_activities: counts.pending,
          overdue_activities: counts.overdue,
        }
      })

      await insertStudentSyncSnapshots(supabase, snapshots)
      console.log(`[moodle-sync-students] course=${courseId} recorded ${snapshots.length} sync snapshots`)
    } catch (snapshotError) {
      console.error('[moodle-sync-students] Error recording sync snapshots:', snapshotError)
      // Non-fatal
    }
  }

  await refreshDashboardAggregatesForCourse(supabase, dbCourse.id)
  await touchCourseLastSync(supabase, dbCourse.id, now)

  return jsonResponse({ success: true, students: syncedStudents || [] })
}

async function refreshDashboardAggregatesForCourse(
  supabase: ReturnType<typeof createServiceClient>,
  courseId: string,
) {
  try {
    await refreshDashboardCourseActivityAggregates(supabase, [courseId])
  } catch (error) {
    console.error('[moodle-sync-students] Error refreshing dashboard aggregates:', error)
  }
}
