export const studentKeys = {
  all: (userId?: string) => ['students', userId ?? 'anonymous'] as const,
  history: (userId?: string, studentId?: string) =>
    ['students', userId ?? 'anonymous', 'history', studentId ?? 'missing'] as const,
  list: (userId: string | undefined, filters: {
    courseId?: string;
    enrollmentStatus?: string;
    page: number;
    pageSize: number;
    riskLevel?: string;
    search?: string;
  }) => [
    'students',
    userId ?? 'anonymous',
    'list',
    filters.courseId ?? 'all',
    filters.search ?? '',
    filters.riskLevel ?? 'all',
    filters.enrollmentStatus ?? 'all',
    filters.page,
    filters.pageSize,
  ] as const,
  profile: (userId?: string, studentId?: string) =>
    ['students', userId ?? 'anonymous', 'profile', studentId ?? 'missing'] as const,
};
