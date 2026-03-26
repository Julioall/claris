import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export interface SupportTicketFilters {
  status?: string;
  type?: string;
  limit?: number;
}

export interface SupportTicketUpdate {
  admin_notes?: string | null;
  priority?: string;
  resolved_at?: string | null;
  status?: string;
}

export interface CreateSupportTicketInput {
  user_id: string | null;
  type: string;
  title: string;
  description: string;
  route: string;
  context: Record<string, unknown>;
}

export async function listSupportTickets(filters: SupportTicketFilters = {}) {
  const {
    limit = 200,
    status,
    type,
  } = filters;

  let query = supabase
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  if (type) {
    query = query.eq('type', type);
  }

  return query;
}

export async function updateSupportTicket(id: string, update: SupportTicketUpdate) {
  return supabase.from('support_tickets').update(update).eq('id', id);
}

export async function createSupportTicket(input: CreateSupportTicketInput) {
  return supabase.from('support_tickets').insert(input);
}

export function subscribeToSupportTickets(onInsert: () => void): RealtimeChannel {
  return supabase
    .channel('admin-support-tickets-realtime')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'support_tickets' },
      onInsert,
    )
    .subscribe();
}

export async function unsubscribeFromSupportTickets(channel: RealtimeChannel) {
  return supabase.removeChannel(channel);
}
