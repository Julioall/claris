import { useAuth } from '@/contexts/AuthContext';

import { useCoursesCatalogQuery } from './useCoursesCatalogQuery';

export function useCoursesData() {
  const { user } = useAuth();
  const query = useCoursesCatalogQuery(user?.id);

  return {
    courses: (query.data ?? []).filter((course) => course.is_following),
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
