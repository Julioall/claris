import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';

import { calendarRepository } from '../api/calendar.repository';
import { agendaKeys } from '../query-keys';
import type { CreateCalendarEventInput, UpdateCalendarEventInput } from '../types';

export function useCalendarEvents(from?: string, to?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const eventsQueryKey = agendaKeys.events(user?.id, from, to);

  const { data: events = [], isLoading } = useQuery({
    queryKey: eventsQueryKey,
    queryFn: () => calendarRepository.listEvents(from, to, user?.id),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateCalendarEventInput) =>
      calendarRepository.createEvent({ ...input, owner: user?.id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: agendaKeys.allEvents(user?.id) });
      toast.success('Evento criado com sucesso');
    },
    onError: () => toast.error('Erro ao criar evento'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCalendarEventInput }) =>
      calendarRepository.updateEvent(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: agendaKeys.allEvents(user?.id) });
      toast.success('Evento atualizado');
    },
    onError: () => toast.error('Erro ao atualizar evento'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => calendarRepository.deleteEvent(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: agendaKeys.allEvents(user?.id) });
      toast.success('Evento removido');
    },
    onError: () => toast.error('Erro ao remover evento'),
  });

  return {
    events,
    isLoading,
    createEvent: createMutation.mutate,
    updateEvent: updateMutation.mutate,
    deleteEvent: deleteMutation.mutate,
    isCreating: createMutation.isPending,
  };
}
