import { useState } from 'react';
import { CalendarDays, Plus, List, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Spinner } from '@/components/ui/spinner';
import { CalendarEventCard } from '@/components/agenda/CalendarEventCard';
import { CalendarEventForm } from '@/components/agenda/CalendarEventForm';
import { AgendaCalendarView } from '@/components/agenda/AgendaCalendarView';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import type { CalendarEvent, CalendarEventType } from '@/types';
import { format, parseISO, isThisWeek, isThisMonth, isFuture } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const GROUP_THIS_WEEK = 'Esta semana';
const GROUP_THIS_MONTH = 'Este mês';
const GROUP_PAST = 'Passados';

type ViewMode = 'list' | 'calendar';

function groupEventsByPeriod(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const groups: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    const d = parseISO(ev.start_at);
    let key: string;
    if (isThisWeek(d, { locale: ptBR })) {
      key = GROUP_THIS_WEEK;
    } else if (isThisMonth(d)) {
      key = GROUP_THIS_MONTH;
    } else if (isFuture(d)) {
      const raw = format(d, 'MMMM yyyy', { locale: ptBR });
      key = raw.charAt(0).toUpperCase() + raw.slice(1);
    } else {
      key = GROUP_PAST;
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(ev);
  }
  return groups;
}

function sortGroups(groups: Record<string, CalendarEvent[]>) {
  const keys = Object.keys(groups);
  keys.sort((a, b) => {
    if (a === GROUP_THIS_WEEK) return -1;
    if (b === GROUP_THIS_WEEK) return 1;
    if (a === GROUP_THIS_MONTH) return -1;
    if (b === GROUP_THIS_MONTH) return 1;
    if (a === GROUP_PAST) return 1;
    if (b === GROUP_PAST) return -1;
    return a.localeCompare(b, 'pt-BR');
  });
  return keys;
}

export default function Agenda() {
  const { events, isLoading, createEvent, updateEvent, deleteEvent, isCreating } = useCalendarEvents();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [defaultStartAt, setDefaultStartAt] = useState<string | undefined>(undefined);

  const grouped = groupEventsByPeriod(events);
  const sortedKeys = sortGroups(grouped);

  const openCreate = (startAt?: string) => {
    setDefaultStartAt(startAt);
    setEditingEvent(null);
    setFormOpen(true);
  };
  const openEdit = (ev: CalendarEvent) => { setEditingEvent(ev); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setEditingEvent(null); setDefaultStartAt(undefined); };

  const handleFormSubmit = (values: { title: string; description?: string; start_at: string; end_at?: string; type: CalendarEventType }) => {
    if (editingEvent) {
      updateEvent({ id: editingEvent.id, input: values }, { onSuccess: closeForm });
    } else {
      createEvent(values, { onSuccess: closeForm });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Agenda
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Compromissos, reuniões, WebAulas e entregas importantes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border overflow-hidden">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="h-9 rounded-none px-3 gap-1.5 text-xs"
              onClick={() => setViewMode('list')}
            >
              <List className="h-3.5 w-3.5" />
              Lista
            </Button>
            <Button
              variant={viewMode === 'calendar' ? 'default' : 'ghost'}
              size="sm"
              className="h-9 rounded-none px-3 gap-1.5 text-xs"
              onClick={() => setViewMode('calendar')}
            >
              <CalendarRange className="h-3.5 w-3.5" />
              Calendário
            </Button>
          </div>
          <Button onClick={() => openCreate()} className="shrink-0">
            <Plus className="h-4 w-4 mr-1.5" />
            Novo evento
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : viewMode === 'calendar' ? (
        <AgendaCalendarView
          events={events}
          onEdit={openEdit}
          onDelete={id => setDeleteId(id)}
          onCreateOnDate={openCreate}
        />
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <CalendarDays className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            Nenhum evento na agenda ainda
          </p>
          <Button variant="outline" size="sm" onClick={() => openCreate()} className="mt-4">
            <Plus className="h-4 w-4 mr-1.5" />
            Criar primeiro evento
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedKeys.map(group => (
            <div key={group}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</h2>
              <div className="space-y-2">
                {grouped[group].map(ev => (
                  <CalendarEventCard
                    key={ev.id}
                    event={ev}
                    onEdit={openEdit}
                    onDelete={id => setDeleteId(id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={open => { if (!open) closeForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Editar evento' : 'Novo evento'}</DialogTitle>
            <DialogDescription>
              {editingEvent ? 'Atualize as informações do evento.' : 'Preencha os dados para criar um novo evento na agenda.'}
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

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O evento será permanentemente removido da agenda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) deleteEvent(deleteId, { onSuccess: () => setDeleteId(null) }); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
