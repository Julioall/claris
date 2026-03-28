import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export interface SupportTicketFilters {
  status?: string;
  type?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedSupportTickets {
  items: unknown[];
  totalCount: number;
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
    page = 1,
    pageSize = 30,
    search,
    status,
    type,
  } = filters;

  const normalizedPage = Math.max(page, 1);
  const normalizedPageSize = Math.min(Math.max(pageSize, 1), 100);
  const from = (normalizedPage - 1) * normalizedPageSize;
  const to = from + normalizedPageSize - 1;

  let query = supabase
    .from('support_tickets')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status) {
    query = query.eq('status', status);
  }

  if (type) {
    query = query.eq('type', type);
  }

  if (search?.trim()) {
    const normalizedSearch = search.trim();
    query = query.or(`title.ilike.%${normalizedSearch}%,description.ilike.%${normalizedSearch}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    items: data ?? [],
    totalCount: count ?? 0,
  };
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
