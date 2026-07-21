export const ACADEMIC_REPORTS_CONTRACT_VERSION = 1 as const
export const ACADEMIC_REPORTS_MAX_BODY_BYTES = 16 * 1024
export const ACADEMIC_REPORTS_MAX_COURSE_IDS = 120

export const ACADEMIC_REPORT_ACTIONS = [
  'list_courses',
  'get_grades_report',
  'get_pending_activities_report',
] as const

export const ACADEMIC_REPORT_COURSE_LIFECYCLES = [
  'nao_iniciada',
  'em_andamento',
  'finalizada',
] as const

export const ACADEMIC_REPORT_PENDING_STATUSES = [
  'pendingSubmission',
  'pendingCorrection',
] as const

export type AcademicReportAction = typeof ACADEMIC_REPORT_ACTIONS[number]
export type AcademicReportCourseLifecycleDto = typeof ACADEMIC_REPORT_COURSE_LIFECYCLES[number]
export type AcademicReportPendingStatusDto = typeof ACADEMIC_REPORT_PENDING_STATUSES[number]

export interface AcademicReportMetadataDto {
  contractVersion: typeof ACADEMIC_REPORTS_CONTRACT_VERSION
  generatedAt: string
}

export interface AcademicReportCourseDto {
  category: string | null
  effectiveEndsAt: string | null
  endsAt: string | null
  id: string
  lifecycleStatus: AcademicReportCourseLifecycleDto
  name: string
  shortName: string | null
  startsAt: string | null
}

export interface AcademicReportCoursesDto {
  items: AcademicReportCourseDto[]
  metadata: AcademicReportMetadataDto
}

export interface AcademicReportGradeDto {
  courseId: string
  gradePercentage: number | null
  gradeRaw: number | null
}

export interface AcademicGradesReportStudentDto {
  grades: AcademicReportGradeDto[]
  isSuspended: boolean
  lastAccessAt: string | null
  name: string
  studentId: string
}

export interface AcademicGradesReportDto {
  metadata: AcademicReportMetadataDto
  students: AcademicGradesReportStudentDto[]
  units: AcademicReportCourseDto[]
}

export interface AcademicPendingReportStudentDto {
  lastAccessAt: string | null
  name: string
  pendingCorrectionCount: number
  pendingSubmissionCount: number
  studentId: string
  totalCount: number
}

export interface AcademicPendingReportDetailDto {
  activityName: string
  activityType: string
  courseId: string
  studentId: string
  unitName: string
  workflowStatus: AcademicReportPendingStatusDto
}

export interface AcademicPendingActivitiesReportDto {
  details: AcademicPendingReportDetailDto[]
  metadata: AcademicReportMetadataDto
  students: AcademicPendingReportStudentDto[]
}

export type AcademicReportResponseDto =
  | AcademicReportCoursesDto
  | AcademicGradesReportDto
  | AcademicPendingActivitiesReportDto
