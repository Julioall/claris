import type { Enums, Json } from '@/integrations/supabase/types';

import type { BulkMessageJobPreview } from '@/features/messages/types';

export interface BulkJobListItem extends BulkMessageJobPreview {
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  template_id: string | null;
  user_id: string;
}

export interface BulkJobListFilters {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedBulkJobs {
  items: BulkJobListItem[];
  totalCount: number;
}

export type BulkJobDetail = BulkJobListItem;

export interface BulkJobRecipient {
  id: string;
  student_name: string;
  moodle_user_id: string;
  status: Enums<'bulk_recipient_status'>;
  personalized_message: string | null;
  sent_at: string | null;
  error_message: string | null;
}

export interface ScheduledMessage {
  id: string;
  title: string;
  message_content: string;
  template_id: string | null;
  scheduled_at: string;
  status: string;
  origin: string;
  recipient_count: number | null;
  sent_count: number;
  failed_count: number;
  notes: string | null;
  created_at: string;
  error_message: string | null;
  channel: 'moodle' | 'whatsapp';
  whatsapp_instance_id?: string;
  execution_context: ScheduledMessageExecutionContext;
  result_context: Json | null;
  executed_bulk_job_id: string | null;
  execution_attempts: number;
  last_execution_at: string | null;
}

export interface ScheduledMessageListFilters {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedScheduledMessages {
  items: ScheduledMessage[];
  totalCount: number;
}

export interface ScheduledMessageFormValues {
  title: string;
  message_content: string;
  scheduled_at: string;
  template_id?: string;
  recipient_count?: number;
  notes?: string;
  channel: 'moodle' | 'whatsapp';
  whatsapp_instance_id?: string;
  execution_context?: ScheduledMessageExecutionContext;
}

export interface AccessibleWhatsappInstance {
  id: string;
  name: string;
  scope: string;
  connection_status: string;
  is_active: boolean;
  is_blocked: boolean;
  owner_user_id: string | null;
}

export interface ScheduledMessageRecipientSnapshot {
  moodle_user_id: string;
  personalized_message?: string | null;
  student_id: string;
  student_name: string;
  [key: string]: Json | undefined;
}

export interface ScheduledMessageExecutionContext {
  schema_version?: number;
  mode?: 'legacy_placeholder' | 'bulk_message_snapshot' | string;
  channel?: 'moodle' | 'whatsapp';
  created_via?: string;
  automatic_execution_supported?: boolean;
  blocking_reason?: string;
  moodle_url?: string;
  whatsapp_instance_id?: string | null;
  recipient_snapshot?: ScheduledMessageRecipientSnapshot[];
  [key: string]: Json | undefined;
}
