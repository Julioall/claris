import { useMemo, useState } from 'react';
import { CalendarDays, CalendarRange, List, Plus } from 'lucide-react';

import { AgendaCalendarView } from '@/components/agenda/AgendaCalendarView';
import { AgendaTaskCard } from '@/components/agenda/AgendaTaskCard';
import { CalendarEventCard } from '@/components/agenda/CalendarEventCard';
import { CalendarEventForm } from '@/components/agenda/CalendarEventForm';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { useTasks } from '@/features/tasks/hooks/useTasks';
import type { Task } from '@/features/tasks/types';

import { buildAgendaItems, groupAgendaItemsByPeriod, sortAgendaGroupKeys } from '../lib/agenda';
import type { CalendarEvent, CalendarEventType } from '../types';
import { useCalendarEvents } from '../hooks/useCalendarEvents';

type ViewMode = 'list' | 'calendar';

export default function AgendaPage() {
  const { events, isLoading: eventsLoading, createEvent, updateEvent, deleteEvent, isCreating } = useCalendarEvents();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [defaultStartAt, setDefaultStartAt] = useState<string | undefined>(undefined);
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  const agendaItems = useMemo(() => buildAgendaItems(events, tasks), [events, tasks]);
  const groupedItems = useMemo(() => groupAgendaItemsByPeriod(agendaItems), [agendaItems]);
  const sortedKeys = useMemo(() => sortAgendaGroupKeys(groupedItems), [groupedItems]);
  const isLoading = eventsLoading || tasksLoading;

  const openCreate = (startAt?: string) => {
    setDefaultStartAt(startAt);
    setEditingEvent(null);
    setFormOpen(true);
  };

  const openEdit = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingEvent(null);
    setDefaultStartAt(undefined);
  };

  const handleFormSubmit = (values: {
    title: string;
    description?: string;
    start_at: string;
    end_at?: string;
    type: CalendarEventType;
  }) => {
    if (editingEvent) {
      updateEvent({ id: editingEvent.id, input: values }, { onSuccess: closeForm });
      return;
    }

    createEvent(values, { onSuccess: closeForm });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CalendarDays className="h-6 w-6 text-primary" />
            Agenda
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compromissos, reunioes, WebAulas, entregas e prazos importantes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border">
            <Button
              variant={viewMode === 'calendar' ? 'default' : 'ghost'}
              size="sm"
              className="h-9 gap-1.5 rounded-none px-3 text-xs"
              onClick={() => setViewMode('calendar')}
            >
              <CalendarRange className="h-3.5 w-3.5" />
              Calendario
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="h-9 gap-1.5 rounded-none px-3 text-xs"
              onClick={() => setViewMode('list')}
            >
              <List className="h-3.5 w-3.5" />
              Lista
            </Button>
          </div>
          <Button onClick={() => openCreate()} className="shrink-0">
            <Plus className="mr-1.5 h-4 w-4" />
            Novo evento
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : viewMode === 'calendar' ? (
        <AgendaCalendarView
          events={events}
          tasks={tasks}
          onEdit={openEdit}
          onDelete={(id) => setDeleteId(id)}
          onCreateOnDate={openCreate}
          onTaskClick={setDetailTask}
        />
      ) : agendaItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            Nenhum compromisso na agenda ainda
          </p>
          <Button variant="outline" size="sm" onClick={() => openCreate()} className="mt-4">
            <Plus className="mr-1.5 h-4 w-4" />
            Criar primeiro evento
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedKeys.map((group) => (
            <div key={group}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</h2>
              <div className="space-y-2">
                {groupedItems[group].map((item) => (
                  item.kind === 'event' ? (
                    <CalendarEventCard
                      key={`event-${item.id}`}
                      event={item.event}
                      onEdit={openEdit}
                      onDelete={(id) => setDeleteId(id)}
                    />
                  ) : (
                    <AgendaTaskCard
                      key={`task-${item.id}`}
                      task={item.task}
                      onClick={setDetailTask}
                    />
                  )
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Editar evento' : 'Novo evento'}</DialogTitle>
            <DialogDescription>
              {editingEvent ? 'Atualize as informacoes do evento.' : 'Preencha os dados para criar um novo evento na agenda.'}
            </DialogDescription>
          </DialogHeader>
          <CalendarEventForm
            defaultValues={editingEvent ?? (defaultStartAt ? { start_at: defaultStartAt, type: 'manual' as const } : undefined)}
            onSubmit={handleFormSubmit}
            onCancel={closeForm}
            isLoading={isCreating}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao nao pode ser desfeita. O evento sera permanentemente removido da agenda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) {
                  deleteEvent(deleteId, { onSuccess: () => setDeleteId(null) });
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TaskDetailDrawer
        task={detailTask}
        open={!!detailTask}
        onClose={() => setDetailTask(null)}
      />
    </div>
  );
}
