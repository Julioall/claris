import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';

import { listStudentsForUser } from '../api/students.repository';
import type { StudentListItem } from '../types';

export function useStudentsData(courseId?: string) {
  const { user } = useAuth();

  const query = useQuery<StudentListItem[], Error>({
    queryKey: ['students', user?.id ?? 'anonymous', courseId ?? 'all'],
    enabled: !!user,
    queryFn: () => listStudentsForUser({ userId: user!.id, courseId }),
  });

  return {
    students: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
