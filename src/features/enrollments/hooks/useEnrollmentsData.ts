import { useQuery } from '@tanstack/react-query';
import {
  fetchEnrollmentDashboard,
  fetchEnrollmentDashboardOptions,
  fetchDistinctEnrollmentValues,
  fetchEnrollmentSummary,
  fetchEnrollmentsPage,
  ENROLLMENTS_PAGE_SIZE,
} from '../api/enrollments.repository';
import type { EnrollmentDashboardFilters, EnrollmentFilters } from '../types';

export const enrollmentKeys = {
  all: ['uc_enrollments'] as const,
  list: (filters: EnrollmentFilters, page: number, pageSize: number) =>
    [...enrollmentKeys.all, 'list', { filters, page, pageSize }] as const,
  filterValues: (column: string) =>
    [...enrollmentKeys.all, 'filter-values', column] as const,
  summary: () => [...enrollmentKeys.all, 'summary'] as const,
  dashboard: (filters: EnrollmentDashboardFilters) =>
    [...enrollmentKeys.all, 'dashboard', filters] as const,
  dashboardOptions: () => [...enrollmentKeys.all, 'dashboard-options'] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Paginated enrollment list
// ─────────────────────────────────────────────────────────────────────────────

export function useEnrollmentsData(
  filters: EnrollmentFilters,
  page: number,
  pageSize = ENROLLMENTS_PAGE_SIZE,
) {
  const query = useQuery({
    queryKey: enrollmentKeys.list(filters, page, pageSize),
    queryFn: () => fetchEnrollmentsPage(filters, page, pageSize),
    placeholderData: (prev) => prev,
  });

  return {
    items: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Distinct values for filter dropdowns
// ─────────────────────────────────────────────────────────────────────────────

export function useEnrollmentFilterValues(
  column: 'papel' | 'status_uc' | 'categoria' | 'nome_uc',
) {
  const query = useQuery({
    queryKey: enrollmentKeys.filterValues(column),
    queryFn: () => fetchDistinctEnrollmentValues(column),
    staleTime: 5 * 60 * 1000,
  });
  return query.data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary indicators
// ─────────────────────────────────────────────────────────────────────────────

export function useEnrollmentSummary() {
  const query = useQuery({
    queryKey: enrollmentKeys.summary(),
    queryFn: fetchEnrollmentSummary,
    staleTime: 30 * 1000,
  });
  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
  };
}

export function useEnrollmentDashboard(filters: EnrollmentDashboardFilters) {
  const query = useQuery({
    queryKey: enrollmentKeys.dashboard(filters),
    queryFn: () => fetchEnrollmentDashboard(filters),
    staleTime: 30 * 1000,
  });

  return {
    dashboard: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message ?? null,
  };
}

export function useEnrollmentDashboardOptions() {
  const query = useQuery({
    queryKey: enrollmentKeys.dashboardOptions(),
    queryFn: fetchEnrollmentDashboardOptions,
    staleTime: 5 * 60 * 1000,
  });

  return {
    options: query.data ?? null,
    isLoading: query.isLoading,
  };
}
