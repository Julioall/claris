import { getStudentActivityWorkflowStatus } from '../_shared/domain/student-activity-status.ts'
import type {
  AcademicGradesReportStudentDto,
  AcademicPendingReportDetailDto,
  AcademicPendingReportStudentDto,
  AcademicReportCourseDto,
  AcademicReportCourseLifecycleDto,
  AcademicReportPendingStatusDto,
} from './contract.ts'

export interface AcademicReportCourseRecord {
  category: string | null
  endAt: string | null
  id: string
  name: string
  shortName: string | null
  startAt: string | null
}

export interface AcademicReportEnrollmentRecord {
  courseId: string
  enrollmentStatus: string | null
  lastAccessAt: string | null
  studentId: string
  studentName: string
}

export interface AcademicReportGradeRecord {
  courseId: string
  gradePercentage: number | null
  gradeRaw: number | null
  id: string
  studentId: string
}

export interface AcademicReportActivityRecord {
  activityName: string
  activityType: string
  completedAt: string | null
  courseId: string
  grade: number | null
  gradeMax: number | null
  gradedAt: string | null
  hidden: boolean
  id: string
  moodleActivityId: string
  status: string | null
  studentId: string
  submittedAt: string | null
}

function sortableTimestamp(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY
}

function hasModuleEndDatePattern(courses: AcademicReportCourseRecord[]): boolean {
  if (courses.length < 2) return false
  const endDates = courses
    .map((course) => course.endAt?.trim())
    .filter((value): value is string => Boolean(value))
  if (endDates.length < 2) return false

  const frequencies = new Map<string, number>()
  endDates.forEach((value) => frequencies.set(value, (frequencies.get(value) ?? 0) + 1))
  return Math.max(...frequencies.values()) >= Math.ceil(endDates.length * 0.6)
}

function withEffectiveEndDates(courses: AcademicReportCourseRecord[]) {
  const exactCategoryGroups = new Map<string, AcademicReportCourseRecord[]>()

  courses.forEach((course) => {
    const category = course.category?.trim() || '__without_category__'
    exactCategoryGroups.set(category, [...(exactCategoryGroups.get(category) ?? []), course])
  })

  const effectiveEndDates = new Map<string, string | null>()
  exactCategoryGroups.forEach((group) => {
    const sorted = [...group].sort((left, right) => (
      sortableTimestamp(left.startAt) - sortableTimestamp(right.startAt)
      || left.name.localeCompare(right.name, 'pt-BR')
      || left.id.localeCompare(right.id)
    ))
    const inferModuleEnd = hasModuleEndDatePattern(sorted)

    sorted.forEach((course, index) => {
      const rawEndAt = course.endAt?.trim() || null
      const nextStartAt = sorted[index + 1]?.startAt?.trim() || null
      effectiveEndDates.set(
        course.id,
        ((inferModuleEnd && nextStartAt) || (!rawEndAt && nextStartAt))
          ? nextStartAt
          : rawEndAt,
      )
    })
  })

  return courses.map((course) => ({
    ...course,
    effectiveEndAt: effectiveEndDates.get(course.id) ?? course.endAt?.trim() ?? null,
  }))
}

function lifecycleStatus(
  course: AcademicReportCourseRecord,
  effectiveEndAt: string | null,
  now: Date,
): AcademicReportCourseLifecycleDto {
  if (course.startAt && new Date(course.startAt) > now) return 'nao_iniciada'
  return effectiveEndAt && new Date(effectiveEndAt) < now
    ? 'finalizada'
    : 'em_andamento'
}

export function mapAcademicReportCourses(
  courses: AcademicReportCourseRecord[],
  now: Date,
  order: 'name' | 'start' = 'name',
): AcademicReportCourseDto[] {
  const mapped = withEffectiveEndDates(courses).map((course) => ({
    category: course.category,
    effectiveEndsAt: course.effectiveEndAt,
    endsAt: course.endAt,
    id: course.id,
    lifecycleStatus: lifecycleStatus(course, course.effectiveEndAt, now),
    name: course.name,
    shortName: course.shortName,
    startsAt: course.startAt,
  }))

  return mapped.sort((left, right) => (
    order === 'start'
      ? sortableTimestamp(left.startsAt) - sortableTimestamp(right.startsAt)
        || left.name.localeCompare(right.name, 'pt-BR')
        || left.id.localeCompare(right.id)
      : left.name.localeCompare(right.name, 'pt-BR') || left.id.localeCompare(right.id)
  ))
}

function studentNamesAndAccess(enrollments: AcademicReportEnrollmentRecord[]) {
  const names = new Map<string, string>()
  const lastAccess = new Map<string, string | null>()
  const suspended = new Set<string>()

  enrollments.forEach((enrollment) => {
    if (!names.has(enrollment.studentId)) {
      names.set(enrollment.studentId, enrollment.studentName || 'Aluno sem nome')
      lastAccess.set(enrollment.studentId, enrollment.lastAccessAt)
    }
    if (enrollment.enrollmentStatus === 'suspenso') suspended.add(enrollment.studentId)
  })

  return { lastAccess, names, suspended }
}

export function buildAcademicGradesReportStudents(
  units: AcademicReportCourseDto[],
  enrollments: AcademicReportEnrollmentRecord[],
  grades: AcademicReportGradeRecord[],
  includeSuspendedStudents: boolean,
): AcademicGradesReportStudentDto[] {
  const { lastAccess, names, suspended } = studentNamesAndAccess(enrollments)
  const unitOrder = new Map(units.map((unit, index) => [unit.id, index]))
  const gradesByStudent = new Map<string, AcademicReportGradeRecord[]>()

  grades.forEach((grade) => {
    if (!names.has(grade.studentId) || !unitOrder.has(grade.courseId)) return
    gradesByStudent.set(grade.studentId, [...(gradesByStudent.get(grade.studentId) ?? []), grade])
  })

  return [...names.entries()]
    .map(([studentId, name]) => ({
      grades: (gradesByStudent.get(studentId) ?? [])
        .sort((left, right) => (
          (unitOrder.get(left.courseId) ?? Number.MAX_SAFE_INTEGER)
          - (unitOrder.get(right.courseId) ?? Number.MAX_SAFE_INTEGER)
          || left.id.localeCompare(right.id)
        ))
        .map((grade) => ({
          courseId: grade.courseId,
          gradePercentage: grade.gradePercentage,
          gradeRaw: grade.gradeRaw,
        })),
      isSuspended: suspended.has(studentId),
      lastAccessAt: lastAccess.get(studentId) ?? null,
      name,
      studentId,
    }))
    .filter((student) => includeSuspendedStudents || !student.isSuspended)
    .sort((left, right) => (
      Number(left.isSuspended) - Number(right.isSuspended)
      || left.name.localeCompare(right.name, 'pt-BR')
      || left.studentId.localeCompare(right.studentId)
    ))
}

function activityKey(activity: Pick<AcademicReportActivityRecord, 'courseId' | 'moodleActivityId'>) {
  return `${activity.courseId}::${activity.moodleActivityId}`
}

function pendingWorkflowStatus(
  activity: AcademicReportActivityRecord,
): AcademicReportPendingStatusDto | null {
  const status = getStudentActivityWorkflowStatus({
    activity_type: activity.activityType,
    completed_at: activity.completedAt,
    grade: activity.grade,
    grade_max: activity.gradeMax,
    graded_at: activity.gradedAt,
    status: activity.status,
    submitted_at: activity.submittedAt,
  })
  if (status === 'pending_submission') return 'pendingSubmission'
  if (status === 'pending_correction') return 'pendingCorrection'
  return null
}

export function buildAcademicPendingActivitiesReport(input: {
  activities: AcademicReportActivityRecord[]
  courses: AcademicReportCourseRecord[]
  enrollments: AcademicReportEnrollmentRecord[]
  now: Date
}): {
  details: AcademicPendingReportDetailDto[]
  students: AcademicPendingReportStudentDto[]
} {
  const { lastAccess, names, suspended } = studentNamesAndAccess(input.enrollments)
  const coursesById = new Map(input.courses.map((course) => [course.id, course]))
  const evaluativeActivityKeys = new Set(
    input.activities
      .filter((activity) => !activity.hidden && (activity.gradeMax ?? 0) > 0)
      .map(activityKey),
  )
  const pendingByStudent = new Map<string, Array<{
    activity: AcademicReportActivityRecord
    workflowStatus: AcademicReportPendingStatusDto
  }>>()

  input.activities.forEach((activity) => {
    if (!evaluativeActivityKeys.has(activityKey(activity))) return
    if (
      activity.hidden
      || activity.activityType === 'quiz'
      || activity.activityType === 'scorm'
      || suspended.has(activity.studentId)
    ) return

    const course = coursesById.get(activity.courseId)
    if (course?.startAt && new Date(course.startAt) > input.now) return
    const workflowStatus = pendingWorkflowStatus(activity)
    if (!workflowStatus) return

    pendingByStudent.set(activity.studentId, [
      ...(pendingByStudent.get(activity.studentId) ?? []),
      { activity, workflowStatus },
    ])
  })

  const sortedStudents = [...pendingByStudent.entries()].sort(([leftId, left], [rightId, right]) => (
    right.length - left.length
    || (names.get(leftId) ?? 'Desconhecido').localeCompare(
      names.get(rightId) ?? 'Desconhecido',
      'pt-BR',
    )
    || leftId.localeCompare(rightId)
  ))

  const students: AcademicPendingReportStudentDto[] = []
  const details: AcademicPendingReportDetailDto[] = []

  sortedStudents.forEach(([studentId, pending]) => {
    const sortedPending = [...pending].sort((left, right) => {
      const leftCourse = coursesById.get(left.activity.courseId)
      const rightCourse = coursesById.get(right.activity.courseId)
      return (
        sortableTimestamp(leftCourse?.startAt ?? null) - sortableTimestamp(rightCourse?.startAt ?? null)
        || (leftCourse?.name ?? '').localeCompare(rightCourse?.name ?? '', 'pt-BR')
        || left.activity.activityName.localeCompare(right.activity.activityName, 'pt-BR')
        || left.activity.moodleActivityId.localeCompare(right.activity.moodleActivityId)
        || left.activity.id.localeCompare(right.activity.id)
      )
    })
    const pendingSubmissionCount = sortedPending.filter(
      ({ workflowStatus }) => workflowStatus === 'pendingSubmission',
    ).length
    const pendingCorrectionCount = sortedPending.length - pendingSubmissionCount

    students.push({
      lastAccessAt: lastAccess.get(studentId) ?? null,
      name: names.get(studentId) ?? 'Desconhecido',
      pendingCorrectionCount,
      pendingSubmissionCount,
      studentId,
      totalCount: sortedPending.length,
    })

    sortedPending.forEach(({ activity, workflowStatus }) => {
      details.push({
        activityName: activity.activityName,
        activityType: activity.activityType,
        courseId: activity.courseId,
        studentId,
        unitName: coursesById.get(activity.courseId)?.name ?? 'N/A',
        workflowStatus,
      })
    })
  })

  return { details, students }
}
