import { supabase } from '@/integrations/supabase/client';

export interface AdminUsageEventFilters {
  eventType?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export async function fetchAppUsageEventsCount() {
  return supabase.from('app_usage_events').select('*', { count: 'exact', head: true });
}

export async function fetchAppErrorLogsCount(options: { resolved?: boolean } = {}) {
  let query = supabase.from('app_error_logs').select('*', { count: 'exact', head: true });

  if (typeof options.resolved === 'boolean') {
    query = query.eq('resolved', options.resolved);
  }

  return query;
}

export async function fetchOpenSupportTicketsCount() {
  return supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'aberto');
}

export async function fetchClarisConversationsCount() {
  return supabase.from('claris_conversations').select('*', { count: 'exact', head: true });
}

export async function fetchUsersCount() {
  return supabase.from('users').select('*', { count: 'exact', head: true });
}

export async function listRecentUsageEvents(sinceIso: string) {
  return supabase
    .from('app_usage_events')
    .select('created_at')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true });
}

export async function listUsageEvents(filters: AdminUsageEventFilters = {}) {
  const {
    dateFrom,
    dateTo,
    eventType,
    limit = 500,
    userId,
  } = filters;

  let query = supabase
    .from('app_usage_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (eventType) {
    query = query.eq('event_type', eventType);
  }

  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (dateFrom) {
    query = query.gte('created_at', dateFrom);
  }

  if (dateTo) {
    query = query.lte('created_at', dateTo);
  }

  return query;
}
