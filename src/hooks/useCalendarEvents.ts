import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { calendarService, type CreateCalendarEventInput, type UpdateCalendarEventInput } from '@/services/calendar.service';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const EVENTS_KEY = ['calendar_events'];

export function useCalendarEvents(from?: string, to?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: events = [], isLoading } = useQuery({
    queryKey: [...EVENTS_KEY, from, to],
    queryFn: () => calendarService.listEvents(from, to),
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateCalendarEventInput) =>
      calendarService.createEvent({ ...input, owner: user?.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EVENTS_KEY });
      toast.success('Evento criado com sucesso');
    },
    onError: () => toast.error('Erro ao criar evento'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCalendarEventInput }) =>
      calendarService.updateEvent(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EVENTS_KEY });
      toast.success('Evento atualizado');
    },
    onError: () => toast.error('Erro ao atualizar evento'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => calendarService.deleteEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EVENTS_KEY });
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
