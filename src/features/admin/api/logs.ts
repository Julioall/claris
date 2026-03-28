import { supabase } from '@/integrations/supabase/client';

export interface AdminErrorLogFilters {
  severity?: string;
  category?: string;
  resolved?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedAdminLogs {
  items: unknown[];
  totalCount: number;
}

export async function listAdminLogs(filters: AdminErrorLogFilters = {}) {
  const {
    category,
    dateFrom,
    dateTo,
    page = 1,
    pageSize = 30,
    resolved,
    search,
    severity,
  } = filters;

  const normalizedPage = Math.max(page, 1);
  const normalizedPageSize = Math.min(Math.max(pageSize, 1), 100);
  const from = (normalizedPage - 1) * normalizedPageSize;
  const to = from + normalizedPageSize - 1;

  let query = supabase
    .from('app_error_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (severity) {
    query = query.eq('severity', severity);
  }

  if (category) {
    query = query.eq('category', category);
  }

  if (typeof resolved === 'boolean') {
    query = query.eq('resolved', resolved);
  }

  if (dateFrom) {
    query = query.gte('created_at', dateFrom);
  }

  if (dateTo) {
    query = query.lte('created_at', dateTo);
  }

  if (search?.trim()) {
    const normalizedSearch = search.trim();
    query = query.or(`message.ilike.%${normalizedSearch}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    items: data ?? [],
    totalCount: count ?? 0,
  };
}

export async function resolveAdminLog(id: string) {
  return supabase
    .from('app_error_logs')
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq('id', id);
}
