export const COURSE_ATTENDANCE_CONTRACT_VERSION = 1 as const

export const ATTENDANCE_STATUSES = ['presente', 'ausente', 'justificado'] as const
export type AttendanceStatusDto = typeof ATTENDANCE_STATUSES[number]

export interface AttendanceStudentDto {
  email: string | null
  id: string
  name: string
}

export interface AttendanceRecordDto {
  date: string
  id: string
  notes: string | null
  status: AttendanceStatusDto
  student: Pick<AttendanceStudentDto, 'id' | 'name'>
  updatedAt: string | null
}

export interface AttendanceDateSummaryDto {
  ausente: number
  date: string
  justificado: number
  presente: number
  total: number
}

export interface AttendanceSheetEntryDto {
  notes: string | null
  status: AttendanceStatusDto
  studentId: string
  updatedAt: string | null
}

export interface CourseAttendanceOverviewDto {
  dateSummaries: AttendanceDateSummaryDto[]
  metadata: {
    contractVersion: typeof COURSE_ATTENDANCE_CONTRACT_VERSION
    generatedAt: string
    hasMore: boolean
    limit: number
    offset: number
  }
  records: AttendanceRecordDto[]
  students: AttendanceStudentDto[]
}

export interface CourseAttendanceSheetDto {
  courseId: string
  date: string
  entries: AttendanceSheetEntryDto[]
  metadata: {
    contractVersion: typeof COURSE_ATTENDANCE_CONTRACT_VERSION
    generatedAt: string
  }
}

export interface SaveCourseAttendanceDto {
  courseId: string
  date: string
  metadata: {
    contractVersion: typeof COURSE_ATTENDANCE_CONTRACT_VERSION
    generatedAt: string
  }
  savedCount: number
}
