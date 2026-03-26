import type { Enums } from '@/integrations/supabase/types';

import type { BulkMessageJobPreview } from '@/features/messages/types';

export interface BulkJobListItem extends BulkMessageJobPreview {
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  template_id: string | null;
  user_id: string;
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
  scheduled_at: string;
  status: string;
  origin: string;
  recipient_count: number | null;
  sent_count: number;
  failed_count: number;
  notes: string | null;
  created_at: string;
  channel: 'moodle' | 'whatsapp';
  whatsapp_instance_id?: string;
}

export interface ScheduledMessageFormValues {
  title: string;
  message_content: string;
  scheduled_at: string;
  recipient_count?: number;
  notes?: string;
  channel: 'moodle' | 'whatsapp';
  whatsapp_instance_id?: string;
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
