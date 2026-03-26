import type { DashboardWeekFilter } from './types';

function normalizeCourseFilter(courseFilter?: string) {
  return courseFilter && courseFilter !== 'all' ? courseFilter : 'all';
}

export const dashboardKeys = {
  all: (userId?: string) => ['dashboard', userId ?? 'anonymous'] as const,
  data: (
    userId?: string,
    selectedWeek: DashboardWeekFilter = 'current',
    courseFilter?: string,
  ) => ['dashboard', userId ?? 'anonymous', selectedWeek, normalizeCourseFilter(courseFilter)] as const,
};
