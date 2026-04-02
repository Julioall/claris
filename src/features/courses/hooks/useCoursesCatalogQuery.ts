import { useQuery } from '@tanstack/react-query';

import { listCatalogCoursesForUser } from '../api/courses.repository';
import { courseKeys } from '../query-keys';
import type { CourseWithStats } from '../types';

export function useCoursesCatalogQuery(userId?: string) {
  return useQuery<CourseWithStats[], Error>({
    queryKey: courseKeys.catalog(userId),
    enabled: !!userId,
    queryFn: () => listCatalogCoursesForUser(userId!),
    staleTime: 5 * 60_000,
  });
}
