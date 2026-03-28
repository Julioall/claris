import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';

import { listStudentsForUser } from '../api/students.repository';
import type { StudentListPage } from '../types';

interface UseStudentsDataParams {
  courseId?: string;
  searchQuery?: string;
  riskFilter?: string;
  statusFilter?: string;
  page?: number;
  pageSize?: number;
}

export function useStudentsData({
  courseId,
  searchQuery,
  riskFilter,
  statusFilter,
  page = 1,
  pageSize = 30,
}: UseStudentsDataParams = {}) {
  const { user } = useAuth();

  const query = useQuery<StudentListPage, Error>({
    queryKey: ['students', user?.id ?? 'anonymous', courseId ?? 'all', searchQuery ?? '', riskFilter ?? 'all', statusFilter ?? 'all', page, pageSize],
    enabled: !!user,
    queryFn: () => listStudentsForUser({ courseId, searchQuery, riskFilter, statusFilter, page, pageSize }),
  });

  return {
    students: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
