import { supabase } from '@/integrations/supabase/client';

export interface AdminErrorLogFilters {
  severity?: string;
  category?: string;
  resolved?: boolean;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export async function listAdminLogs(filters: AdminErrorLogFilters = {}) {
  const {
    category,
    dateFrom,
    dateTo,
    limit = 200,
    resolved,
    severity,
  } = filters;

  let query = supabase
    .from('app_error_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

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

  return query;
}

export async function resolveAdminLog(id: string) {
  return supabase
    .from('app_error_logs')
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq('id', id);
}
