import { useQuery } from '@tanstack/react-query';
import {
  fetchTutorWorkloadKPIs,
  type WorkloadKpiFilters,
} from '../api/workload.repository';

export const workloadKeys = {
  all: ['workload_kpis'] as const,
  kpis: (filters: WorkloadKpiFilters) => [...workloadKeys.all, 'kpis', filters] as const,
};

export function useWorkloadKPIs(filters: WorkloadKpiFilters, enabled = true) {
  const query = useQuery({
    queryKey: workloadKeys.kpis(filters),
    queryFn: () => fetchTutorWorkloadKPIs(filters),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
  };
}
