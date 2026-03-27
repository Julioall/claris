import { supabase } from '@/integrations/supabase/client';
import type { Json, Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

import type {
  AccessibleWhatsappInstance,
  BulkJobDetail,
  BulkJobListItem,
  BulkJobRecipient,
  ScheduledMessageExecutionContext,
  ScheduledMessage,
  ScheduledMessageFormValues,
} from '../types';

function readFilterContext(filterContext: Json | null) {
  if (!filterContext || typeof filterContext !== 'object' || Array.isArray(filterContext)) {
    return {};
  }

  return filterContext as Record<string, Json | undefined>;
}

function readExecutionContext(executionContext: Json | null): ScheduledMessageExecutionContext {
  if (!executionContext || typeof executionContext !== 'object' || Array.isArray(executionContext)) {
    return {};
  }

  return executionContext as ScheduledMessageExecutionContext;
}

function mapScheduledMessage(row: Tables<'scheduled_messages'>): ScheduledMessage {
  const filterContext = readFilterContext(row.filter_context);
  const executionContext = readExecutionContext(row.execution_context);
  const channel = filterContext.channel === 'whatsapp' ? 'whatsapp' : 'moodle';
  const whatsappInstanceId =
    typeof filterContext.whatsapp_instance_id === 'string'
      ? filterContext.whatsapp_instance_id
      : undefined;

  return {
    id: row.id,
    title: row.title,
    message_content: row.message_content,
    scheduled_at: row.scheduled_at,
    status: row.status,
    origin: row.origin,
    recipient_count: row.recipient_count,
    sent_count: row.sent_count,
    failed_count: row.failed_count,
    notes: row.notes,
    created_at: row.created_at,
    channel,
    whatsapp_instance_id: whatsappInstanceId,
    execution_context: executionContext,
    result_context: row.result_context,
    executed_bulk_job_id: row.executed_bulk_job_id,
    execution_attempts: row.execution_attempts,
    last_execution_at: row.last_execution_at,
  };
}

function buildScheduledMessageFilterContext(values: ScheduledMessageFormValues): Json {
  return {
    channel: values.channel,
    whatsapp_instance_id: values.whatsapp_instance_id ?? null,
  };
}

function buildScheduledMessageExecutionContext(values: ScheduledMessageFormValues): Json {
  if (values.execution_context) {
    return values.execution_context as Json;
  }

  const blockingReason =
    values.channel === 'whatsapp'
      ? 'destination_snapshot_missing'
      : 'recipient_snapshot_missing';

  return {
    schema_version: 1,
    mode: 'legacy_placeholder',
    channel: values.channel,
    created_via: 'scheduled_messages_tab',
    automatic_execution_supported: false,
    blocking_reason: blockingReason,
    whatsapp_instance_id: values.whatsapp_instance_id ?? null,
  };
}

export async function listBulkJobs(statusFilter?: string): Promise<BulkJobListItem[]> {
  let query = supabase
    .from('bulk_message_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter as never);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []) as BulkJobListItem[];
}

export async function getBulkJobDetail(jobId: string): Promise<BulkJobDetail> {
  const { data, error } = await supabase
    .from('bulk_message_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) throw error;

  return data as BulkJobDetail;
}

export async function listBulkJobRecipients(jobId: string): Promise<BulkJobRecipient[]> {
  const { data, error } = await supabase
    .from('bulk_message_recipients')
    .select('*')
    .eq('job_id', jobId)
    .order('student_name', { ascending: true });

  if (error) throw error;

  return (data || []) as BulkJobRecipient[];
}

export async function listAccessibleWhatsappInstances(
  userId: string,
): Promise<AccessibleWhatsappInstance[]> {
  const { data, error } = await supabase
    .from('app_service_instances')
    .select('id, name, scope, connection_status, is_active, is_blocked, owner_user_id')
    .eq('service_type', 'whatsapp')
    .eq('is_active', true)
    .eq('is_blocked', false)
    .or(`owner_user_id.eq.${userId},scope.eq.shared`)
    .order('scope', { ascending: false });

  if (error) return [];

  return (data || []) as AccessibleWhatsappInstance[];
}

export async function listScheduledMessages(): Promise<ScheduledMessage[]> {
  const { data, error } = await supabase
    .from('scheduled_messages')
    .select('*')
    .order('scheduled_at', { ascending: true });

  if (error) throw error;

  return ((data || []) as Tables<'scheduled_messages'>[]).map(mapScheduledMessage);
}

export async function createScheduledMessage(userId: string, values: ScheduledMessageFormValues) {
  const payload: TablesInsert<'scheduled_messages'> = {
    user_id: userId,
    title: values.title.trim(),
    message_content: values.message_content.trim(),
    scheduled_at: new Date(values.scheduled_at).toISOString(),
    recipient_count: values.recipient_count ?? null,
    notes: values.notes?.trim() || null,
    origin: 'manual',
    filter_context: buildScheduledMessageFilterContext(values),
    execution_context: buildScheduledMessageExecutionContext(values),
  };

  const { error } = await supabase.from('scheduled_messages').insert(payload);

  if (error) throw error;
}

export async function updateScheduledMessage(id: string, values: ScheduledMessageFormValues) {
  const payload: TablesUpdate<'scheduled_messages'> = {
    title: values.title.trim(),
    message_content: values.message_content.trim(),
    scheduled_at: new Date(values.scheduled_at).toISOString(),
    recipient_count: values.recipient_count ?? null,
    notes: values.notes?.trim() || null,
    filter_context: buildScheduledMessageFilterContext(values),
    execution_context: buildScheduledMessageExecutionContext(values),
  };

  const { error } = await supabase
    .from('scheduled_messages')
    .update(payload)
    .eq('id', id);

  if (error) throw error;
}

export async function cancelScheduledMessage(id: string) {
  const { error } = await supabase
    .from('scheduled_messages')
    .update({ status: 'cancelled' })
    .eq('id', id);

  if (error) throw error;
}
