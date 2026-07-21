export const ADMIN_DIAGNOSTICS_CONTRACT_VERSION = 1 as const

export interface GradeDiagnosticCourseDto {
  id: string
  name: string
}

export interface GradeDiagnosticStudentDto {
  fullName: string
  id: string
}

export interface GradeDiagnosticItemDto {
  activityId: string | null
  gradeFormatted: string | null
  gradeMax: number | string | null
  gradeRaw: number | string | null
  itemName: string | null
  itemType: string | null
  module: string | null
  percentageFormatted: string | null
}

export interface GradeDiagnosticCoursesDto {
  contractVersion: typeof ADMIN_DIAGNOSTICS_CONTRACT_VERSION
  items: GradeDiagnosticCourseDto[]
}

export interface GradeDiagnosticStudentsDto {
  contractVersion: typeof ADMIN_DIAGNOSTICS_CONTRACT_VERSION
  items: GradeDiagnosticStudentDto[]
}

export interface GradeDiagnosticResultDto {
  contractVersion: typeof ADMIN_DIAGNOSTICS_CONTRACT_VERSION
  course: GradeDiagnosticCourseDto
  courseGrade: GradeDiagnosticItemDto | null
  items: GradeDiagnosticItemDto[]
  operationId: string
  student: GradeDiagnosticStudentDto
  summary: {
    returnedItems: number
    totalItems: number
    truncated: boolean
  }
}
