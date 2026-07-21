export const CAMPAIGNS_CONTRACT_VERSION = 1 as const;

export type BulkJobStatusDto = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type BulkRecipientStatusDto = 'pending' | 'sent' | 'failed';
export type ScheduledMessageStatusDto = 'pending' | 'paused' | 'processing' | 'sent' | 'failed' | 'cancelled';

export interface CampaignsMetadataDto {
  contractVersion: typeof CAMPAIGNS_CONTRACT_VERSION;
  generatedAt: string;
}

export interface BulkJobDto {
  completedAt: string | null;
  createdAt: string;
  errorMessage: string | null;
  failedCount: number;
  id: string;
  messageContent: string;
  origin: 'manual' | 'ia';
  sentCount: number;
  startedAt: string | null;
  status: BulkJobStatusDto;
  templateId: string | null;
  totalRecipients: number;
}

export interface BulkJobsPageDto {
  items: BulkJobDto[];
  metadata: CampaignsMetadataDto;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface BulkJobDetailDto {
  job: BulkJobDto;
  metadata: CampaignsMetadataDto;
}

export interface BulkJobRecipientDto {
  errorMessage: string | null;
  id: string;
  moodleUserId: string;
  personalizedMessage: string | null;
  sentAt: string | null;
  status: BulkRecipientStatusDto;
  studentName: string;
}

export interface BulkJobRecipientsPageDto {
  items: BulkJobRecipientDto[];
  metadata: CampaignsMetadataDto;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ScheduledMessageDto {
  channel: 'moodle' | 'whatsapp';
  completedAt: string | null;
  createdAt: string;
  errorMessage: string | null;
  executedBulkJobId: string | null;
  executionAttempts: number;
  executionContext: Record<string, unknown>;
  failedCount: number;
  id: string;
  lastExecutionAt: string | null;
  messageContent: string;
  notes: string | null;
  origin: 'manual' | 'ia';
  recipientCount: number | null;
  resultContext: Record<string, unknown> | null;
  scheduledAt: string;
  sentCount: number;
  startedAt: string | null;
  status: ScheduledMessageStatusDto;
  templateId: string | null;
  title: string;
  updatedAt: string;
  whatsappInstanceId: string | null;
}

export interface ScheduledMessagesPageDto {
  items: ScheduledMessageDto[];
  metadata: CampaignsMetadataDto;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ScheduledMessageMutationDto {
  message: ScheduledMessageDto;
  metadata: CampaignsMetadataDto;
}

export interface ScheduledMessageDeleteDto {
  deleted: boolean;
  metadata: CampaignsMetadataDto;
}
