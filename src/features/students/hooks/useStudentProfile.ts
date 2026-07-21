import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { ApiClientError } from '@/integrations/http/edge-function-client';

import { getStudentProfile } from '../api/students';
import { studentKeys } from '../query-keys';
import type { StudentProfile } from '../types';

export function useStudentProfile(studentId: string | undefined) {
  const { user } = useAuth();

  const query = useQuery<StudentProfile, Error>({
    queryKey: studentKeys.profile(user?.id, studentId),
    enabled: !!user && !!studentId,
    queryFn: ({ signal }) => getStudentProfile(studentId!, signal),
  });
  const notFound = query.error instanceof ApiClientError && query.error.status === 404;

  return {
    courses: query.data?.courses ?? [],
    profile: query.data ?? null,
    student: query.data?.student ?? null,
    isLoading: query.isLoading,
    error: notFound ? 'Aluno não encontrado' : query.error?.message ?? null,
    refetch: query.refetch,
  };
}
