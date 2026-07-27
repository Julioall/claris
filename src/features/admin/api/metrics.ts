import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';
import type {
  AdminDashboardSummaryDto,
  AdminMoodleSyncOperationalMetricsDto,
  AdminPageDto,
  AdminUsageEventDto,
} from './contracts/admin-observability.contract';

export interface AdminUsageEventFilters {
  eventType?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchAdminDashboardSummary() {
  return invokeEdgeFunction<AdminDashboardSummaryDto>('admin-observability', {
    body: { action: 'get_dashboard' },
  });
}

export interface AdminMoodleSyncOperationalMetricsFilters {
  stuckAfterSeconds?: number;
  windowHours?: number;
}

export async function fetchMoodleSyncOperationalMetrics(
  filters: AdminMoodleSyncOperationalMetricsFilters = {},
) {
  return invokeEdgeFunction<AdminMoodleSyncOperationalMetricsDto>('admin-observability', {
    body: {
      action: 'get_moodle_sync_metrics',
      windowHours: filters.windowHours ?? 168,
      stuckAfterSeconds: filters.stuckAfterSeconds ?? 300,
    },
  });
}

export async function listUsageEvents(filters: AdminUsageEventFilters = {}) {
  return invokeEdgeFunction<AdminPageDto<AdminUsageEventDto>>('admin-observability', {
    body: {
      action: 'list_usage_events',
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      eventType: filters.eventType,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 50,
      search: filters.search,
      userId: filters.userId,
    },
  });
}
