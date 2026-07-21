import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

import {
  getCoursePanel,
  setCourseActivityVisibility,
} from '../api/course-panel';
import { setCourseAttendanceEnabled } from '../api/courses-catalog';
import type { CoursePanelDto } from '../api/contracts/course-panel.contract';
import { courseKeys } from '../query-keys';
import { EMPTY_COURSE_PANEL_STATS, type CourseWithStats } from '../types';

export function useCoursePanel(courseId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const hasCourseId = !!courseId;
  const panelQueryKey = courseKeys.panel(user?.id, courseId);

  const panelQuery = useQuery<CoursePanelDto, Error>({
    queryKey: panelQueryKey,
    enabled: hasCourseId && !!user,
    queryFn: ({ signal }) => getCoursePanel(courseId!, signal),
  });

  const toggleActivityVisibilityMutation = useMutation({
    mutationFn: ({ moodleActivityId, hidden }: { moodleActivityId: string; hidden: boolean }) =>
      setCourseActivityVisibility(courseId!, moodleActivityId, hidden),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: panelQueryKey });
      toast({
        title: variables.hidden ? 'Atividade oculta' : 'Atividade visível',
        description: variables.hidden
          ? 'Esta atividade não será contabilizada nas métricas.'
          : 'Esta atividade será contabilizada nas métricas.',
      });
    },
    onError: (error) => {
      console.error('Error toggling activity visibility:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar a visibilidade da atividade.',
        variant: 'destructive',
      });
    },
  });

  const toggleAttendanceMutation = useMutation({
    mutationFn: async (shouldEnable: boolean) => {
      await setCourseAttendanceEnabled([courseId!], shouldEnable);
      return shouldEnable;
    },
    onSuccess: (shouldEnable) => {
      queryClient.setQueryData<CoursePanelDto>(panelQueryKey, (current) => (
        current ? { ...current, attendanceEnabled: shouldEnable } : current
      ));
      queryClient.setQueryData(courseKeys.attendance(user?.id, courseId), shouldEnable);
      queryClient.setQueryData<CourseWithStats[]>(
        courseKeys.catalog(user?.id),
        (current) =>
          current?.map((course) =>
            course.id === courseId
              ? { ...course, is_attendance_enabled: shouldEnable }
              : course,
          ),
      );
    },
    onError: (error) => {
      console.error('Error toggling attendance:', error);
    },
  });

  if (!hasCourseId) {
    return {
      course: null,
      students: [],
      activities: [],
      stats: EMPTY_COURSE_PANEL_STATS,
      isLoading: false,
      error: 'ID do curso não fornecido',
      refetch: async () => undefined,
      toggleActivityVisibility: async () => undefined,
      isAttendanceEnabled: false,
      isLoadingAttendanceFlag: false,
      toggleAttendance: async () => undefined,
    };
  }

  return {
    course: panelQuery.data?.course ?? null,
    students: panelQuery.data?.students ?? [],
    activities: panelQuery.data?.activities ?? [],
    stats: panelQuery.data?.stats ?? EMPTY_COURSE_PANEL_STATS,
    isLoading: panelQuery.isLoading,
    error: panelQuery.error?.message ?? null,
    refetch: async () => {
      await panelQuery.refetch();
    },
    toggleActivityVisibility: async (moodleActivityId: string, hidden: boolean) => {
      await toggleActivityVisibilityMutation.mutateAsync({ moodleActivityId, hidden });
    },
    isAttendanceEnabled: panelQuery.data?.attendanceEnabled ?? false,
    isLoadingAttendanceFlag: panelQuery.isLoading,
    toggleAttendance: async () => {
      if (!user) return;
      await toggleAttendanceMutation.mutateAsync(!(panelQuery.data?.attendanceEnabled ?? false));
    },
  };
}
