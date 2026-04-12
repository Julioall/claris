import { useQuery } from '@tanstack/react-query';
import {
  fetchDropoutKPIs,
  type DropoutKpiFilters,
} from '../api/dropout.repository';

export const dropoutKeys = {
  all: ['dropout_kpis'] as const,
  kpis: (filters: DropoutKpiFilters) => [...dropoutKeys.all, 'kpis', filters] as const,
};

export function useDropoutKPIs(filters: DropoutKpiFilters, enabled = true) {
  const query = useQuery({
    queryKey: dropoutKeys.kpis(filters),
    queryFn: () => fetchDropoutKPIs(filters),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
  };
}
