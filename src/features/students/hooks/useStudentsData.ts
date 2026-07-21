import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';

import { listStudents } from '../api/students';
import {
  STUDENT_ENROLLMENT_STATUSES,
  STUDENT_RISK_LEVELS,
  type StudentEnrollmentStatusDto,
  type StudentRiskLevelDto,
} from '../api/contracts/students.contract';
import { studentKeys } from '../query-keys';
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
  const riskLevel = STUDENT_RISK_LEVELS.includes(riskFilter as StudentRiskLevelDto)
    ? riskFilter as StudentRiskLevelDto
    : undefined;
  const enrollmentStatus = STUDENT_ENROLLMENT_STATUSES.includes(statusFilter as StudentEnrollmentStatusDto)
    ? statusFilter as StudentEnrollmentStatusDto
    : undefined;
  const search = searchQuery?.trim() || undefined;

  const query = useQuery<StudentListPage, Error>({
    queryKey: studentKeys.list(user?.id, {
      courseId,
      enrollmentStatus,
      page,
      pageSize,
      riskLevel,
      search,
    }),
    enabled: !!user,
    queryFn: ({ signal }) => listStudents({
      courseId,
      enrollmentStatus,
      page,
      pageSize,
      riskLevel,
      search,
    }, signal),
  });

  return {
    students: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
