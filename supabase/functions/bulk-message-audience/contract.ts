export const BULK_MESSAGE_AUDIENCE_CONTRACT_VERSION = 1 as const

export interface BulkMessageAudienceMetadataDto {
  contractVersion: typeof BULK_MESSAGE_AUDIENCE_CONTRACT_VERSION
  generatedAt: string
}

export interface BulkMessageAudienceCourseDto {
  category: string | null
  courseId: string
  courseName: string
  enrollmentStatus: string
  lastAccess: string | null
  startDate: string | null
}

export interface BulkMessageAudienceStudentDto {
  avatarUrl: string | null
  courses: BulkMessageAudienceCourseDto[]
  currentRiskLevel: string | null
  email: string | null
  enrollmentStatus: string
  fullName: string
  id: string
  lastAccess: string | null
  moodleUserId: string
}

export interface BulkMessageAudienceDto {
  connectionId: string
  gradeLookup: Record<string, {
    gradeFormatted: string | null
    gradePercentage: number | null
  }>
  metadata: BulkMessageAudienceMetadataDto
  moodleSiteId: string
  pendingLookup: Record<string, number>
  students: BulkMessageAudienceStudentDto[]
}
