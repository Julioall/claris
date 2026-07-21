import { useQuery } from '@tanstack/react-query';

import { listCatalogCourses } from '../api/courses-catalog';
import { courseKeys } from '../query-keys';
import type { CourseWithStats } from '../types';

export function useCoursesCatalogQuery(userId?: string) {
  return useQuery<CourseWithStats[], Error>({
    queryKey: courseKeys.catalog(userId),
    enabled: !!userId,
    queryFn: ({ signal }) => listCatalogCourses(signal),
    staleTime: 5 * 60_000,
  });
}
