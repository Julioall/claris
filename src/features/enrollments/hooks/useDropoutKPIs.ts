import { useQuery } from '@tanstack/react-query';
import {
  fetchDropoutKPIs,
  type DropoutKpiFilters,
} from '../api/dropout.repository';
import type { EnrollmentDashboardFilters } from '../types';

export const dropoutKeys = {
  all: ['dropout_kpis'] as const,
  kpis: (filters: DropoutKpiFilters) => [...dropoutKeys.all, 'kpis', filters] as const,
};

export function useDropoutKPIs(
  filters: EnrollmentDashboardFilters & { excludeSuspended?: boolean },
  enabled = true,
) {
  const kpiFilters: DropoutKpiFilters = {
    startDate:        filters.startDate  || undefined,
    endDate:          filters.endDate    || undefined,
    tutor:            filters.tutor      || undefined,
    school:           filters.school     || undefined,
    category:         filters.category   || undefined,
    statusUc:         filters.statusUc   || undefined,
    excludeSuspended: filters.excludeSuspended ?? false,
  };

  const query = useQuery({
    queryKey: dropoutKeys.kpis(kpiFilters),
    queryFn: () => fetchDropoutKPIs(kpiFilters),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
  };
}
