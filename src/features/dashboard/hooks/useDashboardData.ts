import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { getDashboardSummary } from '../api/dashboard-summary';
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
  const courseId = courseFilter && courseFilter !== 'all' ? courseFilter : undefined;
  const query = useQuery({
    queryKey: dashboardKeys.data(user?.id, selectedWeek, courseFilter),
    queryFn: ({ signal }) => getDashboardSummary({
      courseId,
      week: selectedWeek,
    }, signal),
    enabled: !!user,
    staleTime: 2 * 60_000,
  });

  return {
    summary: query.data?.indicators ?? null,
    criticalStudents: query.data?.criticalStudents ?? [],
    activitiesToReview: query.data?.activitiesToReview ?? [],
    activityFeed: query.data?.activityFeed ?? [],
    metadata: query.data?.metadata ?? null,
    isLoading: !!user && query.isLoading,
    error: getErrorMessage(query.error),
    refetch: query.refetch,
  };
}
