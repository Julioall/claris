import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';

import { getStudentHistory } from '../api/students';
import { studentKeys } from '../query-keys';
import type { StudentHistory } from '../types';

export function useStudentHistory(studentId: string | undefined) {
  const { user } = useAuth();
  const query = useQuery<StudentHistory, Error>({
    queryKey: studentKeys.history(user?.id, studentId),
    queryFn: ({ signal }) => getStudentHistory(studentId!, signal),
    enabled: Boolean(user && studentId),
    staleTime: 5 * 60 * 1000,
  });

  return {
    ...query,
    data: query.data?.items ?? [],
  };
}
