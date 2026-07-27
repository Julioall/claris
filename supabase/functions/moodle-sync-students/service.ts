import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import {
  insertStudentSyncSnapshots,
  listExistingCourseStudentLinks,
  removeStudentCourseLinks,
  touchCourseLastSync,
  upsertStudentCourseLinks,
  upsertStudents,
} from '../_shared/domain/moodle-sync/repository.ts'
import type { CourseSyncRecord } from '../_shared/domain/moodle-sync/repository.ts'
import type { MoodleAccess } from '../_shared/domain/moodle-connections/mod.ts'
import { computeContentHash } from '../_shared/domain/moodle-sync/content-hash.ts'
import {
  callMoodleApi,
  combineMoodleApiTelemetry,
  MoodleApiError,
  type MoodleApiTelemetry,
  type MoodleEnrolledUser,
} from '../_shared/moodle/mod.ts'
import { createMoodleSyncAttemptTelemetry } from '../_shared/domain/moodle-sync/attempt-telemetry.ts'
import {
  createMoodleProviderMetrics,
  toMoodleProviderMetricsMetadata,
} from '../_shared/domain/moodle-sync/provider-metrics.ts'
import { isStudentLikeUser } from '../_shared/moodle/student-role.ts'

const ENROLLED_USERS_PAGE_SIZE = 100
const ENROLLED_USERS_OPTIONAL_FIELDS = [
  'id',
  'username',
  'firstname',
  'lastname',
  'fullname',
  'email',
  'address',
  'phone1',
  'phone2',
  'department',
  'institution',
  'idnumber',
  'city',
  'profileimageurl',
  'lastaccess',
  'lastcourseaccess',
  'roles',
  'groups',
  'suspended',
].join(',')

type MeasuredMoodleApiCall = (
  operation: string,
  parameters?: Record<string, string | number>,
) => Promise<unknown>

interface StudentSyncOptions {
  telemetry?: MoodleApiTelemetry
}

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

function isInvalidEnrolledUsersParameter(error: unknown): boolean {
  if (error instanceof MoodleApiError && error.category === 'invalid_payload') return true
  const message = error instanceof Error
    ? error.message
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    : ''
  return message.includes('valor invalido de parametro')
}

async function getCourseEnrolledUsersWithMetrics(
  callApi: MeasuredMoodleApiCall,
  courseId: number,
): Promise<MoodleEnrolledUser[]> {
  const baseOptions: Record<string, string | number> = {
    'options[0][name]': 'onlyactive',
    'options[0][value]': 0,
    'options[1][name]': 'userfields',
    'options[1][value]': ENROLLED_USERS_OPTIONAL_FIELDS,
  }
  const usersById = new Map<number, MoodleEnrolledUser>()
  let offset = 0

  while (true) {
    let page: unknown
    try {
      page = await callApi('core_enrol_get_enrolled_users', {
        courseid: courseId,
        ...baseOptions,
        limitfrom: offset,
        limitnumber: ENROLLED_USERS_PAGE_SIZE,
      })
    } catch (error) {
      if (!isInvalidEnrolledUsersParameter(error)) throw error
      console.warn('[moodle-sync-students] Enrolment endpoint rejected userfields; using minimal fields.', {
        courseId,
      })
      page = await callApi('core_enrol_get_enrolled_users', {
        'options[0][name]': 'onlyactive',
        'options[0][value]': 0,
        courseid: courseId,
        limitfrom: offset,
        limitnumber: ENROLLED_USERS_PAGE_SIZE,
      })
    }

    const users = Array.isArray(page) ? page : []
    for (const rawUser of users) {
      const user = rawUser as MoodleEnrolledUser
      if (typeof user.id !== 'number' || !Number.isFinite(user.id)) {
        throw new MoodleApiError({
          category: 'invalid_payload',
          code: 'invalid_enrolled_user',
          message: 'Moodle returned an enrolled user without a valid id.',
        })
      }
      usersById.set(user.id, user)
    }

    if (users.length < ENROLLED_USERS_PAGE_SIZE) break
    offset += ENROLLED_USERS_PAGE_SIZE
  }

  return Array.from(usersById.values()).sort((left, right) => left.id - right.id)
}

async function getCourseSuspendedUserIdsWithMetrics(
  callApi: MeasuredMoodleApiCall,
  courseId: number,
): Promise<Set<number>> {
  const users = await callApi('core_enrol_get_enrolled_users', {
    'options[0][name]': 'onlysuspended',
    'options[0][value]': 1,
    courseid: courseId,
  })
  return new Set(
    (Array.isArray(users) ? users : [])
      .map((user: { id?: unknown }) => user.id)
      .filter((id): id is number => typeof id === 'number' && Number.isFinite(id)),
  )
}

export async function syncStudents(
  access: MoodleAccess,
  dbCourse: CourseSyncRecord,
  options: StudentSyncOptions = {},
): Promise<Response> {
  const supabase = createServiceClient()
  const courseId = Number.parseInt(dbCourse.moodle_course_id, 10)
  if (!Number.isSafeInteger(courseId) || courseId <= 0) {
    return errorResponse('Course has an invalid Moodle id', 409)
  }
  const providerMetrics = createMoodleProviderMetrics()
  const attemptTelemetry = combineMoodleApiTelemetry(
    options.telemetry ?? createMoodleSyncAttemptTelemetry({
      connectionId: access.connectionId,
      siteSlug: access.siteSlug,
    }),
    providerMetrics.telemetry(),
  )
  const callMoodleApiWithMetrics: MeasuredMoodleApiCall = (operation, parameters = {}) => (
    providerMetrics.call(() => callMoodleApi(
      access.moodleUrl,
      access.token,
      operation,
      parameters,
      25_000,
      attemptTelemetry,
    ))
  )

  const [enrolledUsers, suspendedUserIds] = await Promise.all([
    getCourseEnrolledUsersWithMetrics(callMoodleApiWithMetrics, courseId),
    getCourseSuspendedUserIdsWithMetrics(callMoodleApiWithMetrics, courseId),
  ])
  console.log(`Found ${enrolledUsers.length} enrolled users in course ${courseId}`)

  const usersWithoutRoles = enrolledUsers.filter((u) => !u.roles || u.roles.length === 0).length
  const students = enrolledUsers.filter((u) => isStudentLikeUser(u))
  const nonStudentUsers = enrolledUsers.filter((u) => !isStudentLikeUser(u))
  console.log(`Found ${students.length} students in course ${courseId}`)
  console.log(
    `[moodle-sync-students] course=${courseId} enrolled_users=${enrolledUsers.length} users_without_roles=${usersWithoutRoles} inferred_students=${students.length} non_students=${nonStudentUsers.length}`
  )

  const existingCourseLinks = await listExistingCourseStudentLinks(supabase, dbCourse.id)
  const nonStudentMoodleUserIds = new Set(
    nonStudentUsers
      .map((user) => String(user.id))
      .filter((id) => id.length > 0)
  )
  const nonStudentCourseStudentIds = existingCourseLinks
    .filter((row) => row.moodle_user_id && nonStudentMoodleUserIds.has(String(row.moodle_user_id)))
    .map((row) => row.student_id)

  if (nonStudentCourseStudentIds.length > 0) {
    await removeStudentCourseLinks(supabase, dbCourse.id, nonStudentCourseStudentIds)
    console.log(
      `[moodle-sync-students] course=${courseId} removed_non_student_links=${nonStudentCourseStudentIds.length}`
    )
  }

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
    return jsonResponse({
      success: true,
      students: [],
      ...toMoodleProviderMetricsMetadata(providerMetrics.snapshot()),
    })
  }

  const now = new Date().toISOString()
  let suspendedByStudentStatusCount = 0
  let suspendedByStudentFlagCount = 0
  let suspendedByEnrollmentStatusCount = 0
  let suspendedByEnrolledCourseFlagCount = 0
  let suspendedByOnlySuspendedCount = 0

  const studentsData = await Promise.all(students.map(async (student) => {
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

    const city = resolveStudentCity(student, undefined)
    const phoneSource = {
      phone1: student.phone1,
      phone2: student.phone2,
      customfields: student.customfields,
    }

    const { phone, phone_number, mobile_phone } = resolveStudentPhones(phoneSource)

    const normalizedStudent = {
      moodle_user_id: String(student.id),
      moodle_site_id: access.moodleSiteId,
      full_name: student.fullname || `${student.firstname} ${student.lastname}`,
      email: student.email || null,
      city,
      phone,
      phone_number,
      mobile_phone,
      avatar_url: student.profileimageurl || null,
      last_access: student.lastaccess ? new Date(student.lastaccess * 1000).toISOString() : null,
    }

    return {
      ...normalizedStudent,
      content_hash: await computeContentHash(normalizedStudent),
      observed_at: now,
      last_synced_at: now,
      last_synced_connection_id: access.connectionId,
      updated_at: now,
      _enrollment_status: enrollmentStatus,
      _last_course_access: lastCourseAccess,
    }
  }))

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

    const inferredSuspendedLinks = existingCourseLinks
      .map((row) => {
        const moodleUserId = row.moodle_user_id ? String(row.moodle_user_id) : null
        if (!moodleUserId) return null
        if (nonStudentMoodleUserIds.has(moodleUserId)) return null
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

  await touchCourseLastSync(supabase, dbCourse.id, now)

  return jsonResponse({
    success: true,
    contractVersion: 2,
    connectionId: access.connectionId,
    siteSlug: access.siteSlug,
    students: syncedStudents || [],
    ...toMoodleProviderMetricsMetadata(providerMetrics.snapshot()),
  })
}
