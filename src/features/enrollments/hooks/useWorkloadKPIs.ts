import { useQuery } from '@tanstack/react-query';
import {
  fetchTutorWorkloadKPIs,
  type WorkloadKpiFilters,
} from '../api/workload.repository';
import type { EnrollmentDashboardFilters } from '../types';

export const workloadKeys = {
  all: ['workload_kpis'] as const,
  kpis: (filters: WorkloadKpiFilters) => [...workloadKeys.all, 'kpis', filters] as const,
};

export function useWorkloadKPIs(
  filters: EnrollmentDashboardFilters & { excludeSuspended?: boolean },
  enabled = true,
) {
  const kpiFilters: WorkloadKpiFilters = {
    startDate:        filters.startDate  || undefined,
    endDate:          filters.endDate    || undefined,
    tutor:            filters.tutor      || undefined,
    school:           filters.school     || undefined,
    category:         filters.category   || undefined,
    statusUc:         filters.statusUc   || undefined,
    excludeSuspended: filters.excludeSuspended ?? false,
  };

  const query = useQuery({
    queryKey: workloadKeys.kpis(kpiFilters),
    queryFn: () => fetchTutorWorkloadKPIs(kpiFilters),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
  };
}
