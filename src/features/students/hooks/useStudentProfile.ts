import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';

import { getStudentProfile } from '../api/students.repository';
import type { StudentProfile } from '../types';

export function useStudentProfile(studentId: string | undefined) {
  const { user } = useAuth();

  const query = useQuery<StudentProfile | null, Error>({
    queryKey: ['student', user?.id ?? 'anonymous', studentId ?? 'missing'],
    enabled: !!user && !!studentId,
    queryFn: () => getStudentProfile(studentId!),
  });

  return {
    student: query.data ?? null,
    isLoading: query.isLoading,
    error: query.data === null && query.isSuccess
      ? 'Aluno não encontrado'
      : query.error?.message ?? null,
    refetch: query.refetch,
  };
}
