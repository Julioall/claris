import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';

export function useSyncStudentsMutation() {
  const queryClient = useQueryClient();
  const { syncStudentsIncremental } = useAuth();

  return useMutation({
    mutationFn: async (courseIds: string[]) => {
      if (courseIds.length === 0) return;
      await syncStudentsIncremental(courseIds);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['students'] }),
        queryClient.invalidateQueries({ queryKey: ['student'] }),
      ]);
    },
  });
}
