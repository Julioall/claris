export const courseKeys = {
  catalog: (userId?: string) => ['courses', 'catalog', userId ?? 'anonymous'] as const,
  panel: (userId?: string, courseId?: string) =>
    ['courses', 'panel', userId ?? 'anonymous', courseId ?? 'missing'] as const,
  attendance: (userId?: string, courseId?: string) =>
    ['courses', 'attendance', userId ?? 'anonymous', courseId ?? 'missing'] as const,
};
