import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';
import type {
  AdminErrorLogDto,
  AdminPageDto,
  ResolveAdminErrorLogDto,
} from './contracts/admin-observability.contract';

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

export async function listAdminLogs(filters: AdminErrorLogFilters = {}) {
  return invokeEdgeFunction<AdminPageDto<AdminErrorLogDto>>('admin-observability', {
    body: {
      action: 'list_error_logs',
      category: filters.category,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 30,
      resolved: filters.resolved,
      search: filters.search,
      severity: filters.severity,
    },
  });
}

export async function resolveAdminLog(logId: string) {
  return invokeEdgeFunction<ResolveAdminErrorLogDto>('admin-observability', {
    body: { action: 'resolve_error_log', logId },
  });
}
