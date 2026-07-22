export const BULK_MESSAGE_AUDIENCE_CONTRACT_VERSION = 1 as const;
export const BULK_MESSAGE_SEND_CONTRACT_VERSION = 1 as const;

export interface BulkMessagingMetadataDto {
  contractVersion: 1;
  generatedAt: string;
}

export interface BulkAudienceCourseDto {
  category: string | null;
  courseId: string;
  courseName: string;
  enrollmentStatus: string;
  lastAccess: string | null;
  startDate: string | null;
}

export interface BulkAudienceStudentDto {
  avatarUrl: string | null;
  courses: BulkAudienceCourseDto[];
  currentRiskLevel: string | null;
  email: string | null;
  enrollmentStatus: string;
  fullName: string;
  id: string;
  lastAccess: string | null;
  moodleUserId: string;
}

export interface BulkMessageAudienceDto {
  connectionId: string;
  gradeLookup: Record<string, {
    gradeFormatted: string | null;
    gradePercentage: number | null;
  }>;
  metadata: BulkMessagingMetadataDto;
  moodleSiteId: string;
  pendingLookup: Record<string, number>;
  students: BulkAudienceStudentDto[];
}

export type BulkMessageSendResultDto =
  | { jobId: string; kind: 'duplicate'; metadata: BulkMessagingMetadataDto }
  | {
      failed: number;
      jobId: string;
      kind: 'started' | 'resumed';
      metadata: BulkMessagingMetadataDto;
      sent: number;
      status: 'completed' | 'failed';
    };
