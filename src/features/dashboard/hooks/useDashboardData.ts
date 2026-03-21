import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { dashboardRepository } from '../api/dashboard.repository';
import { dashboardKeys } from '../query-keys';
import type { DashboardWeekFilter } from '../types';

function getErrorMessage(error: unknown) {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return 'Erro ao carregar dados';
}

export function useDashboardData(
  selectedWeek: DashboardWeekFilter = 'current',
  courseFilter?: string,
) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: dashboardKeys.data(user?.id, selectedWeek, courseFilter),
    queryFn: () =>
      dashboardRepository.getDashboardData({
        userId: user!.id,
        selectedWeek,
        courseFilter,
      }),
    enabled: !!user,
  });

  return {
    summary: query.data?.summary ?? null,
    criticalStudents: query.data?.criticalStudents ?? [],
    activitiesToReview: query.data?.activitiesToReview ?? [],
    activityFeed: query.data?.activityFeed ?? [],
    isLoading: !!user && query.isLoading,
    error: getErrorMessage(query.error),
    refetch: query.refetch,
  };
}
