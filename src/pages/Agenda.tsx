import { useState, useMemo } from 'react';
import {
  Calendar,
  CalendarDays,
  Clock,
  List,
  MapPin,
  Plus,
  Trash2,
  Video,
  Users,
} from 'lucide-react';
import { format, isToday, isTomorrow, isPast, startOfDay, endOfDay, addDays, startOfWeek, endOfWeek, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAgendaData } from '@/hooks/useAgendaData';
import type { AgendaEventType, AgendaEvent } from '@/types';

const EVENT_TYPE_LABELS: Record<AgendaEventType, string> = {
  reuniao: 'Reunião',
  webaula: 'WebAula',
  rotina: 'Rotina',
  compromisso: 'Compromisso',
  outro: 'Outro',
};

const EVENT_TYPE_COLORS: Record<AgendaEventType, string> = {
  reuniao: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  webaula: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  rotina: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  compromisso: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  outro: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const EVENT_TYPE_BORDER: Record<AgendaEventType, string> = {
  reuniao: 'border-l-blue-500',
  webaula: 'border-l-purple-500',
  rotina: 'border-l-green-500',
  compromisso: 'border-l-yellow-500',
  outro: 'border-l-slate-400',
};

function formatEventDate(startAt: string, endAt?: string, allDay?: boolean) {
  const start = new Date(startAt);

  if (allDay) {
    if (isToday(start)) return 'Hoje (dia inteiro)';
    if (isTomorrow(start)) return 'Amanhã (dia inteiro)';
    return format(start, "EEEE, dd 'de' MMM", { locale: ptBR });
  }

  const timeStr = format(start, 'HH:mm', { locale: ptBR });
  const endTimeStr = endAt ? ` – ${format(new Date(endAt), 'HH:mm', { locale: ptBR })}` : '';

  if (isToday(start)) return `Hoje, ${timeStr}${endTimeStr}`;
  if (isTomorrow(start)) return `Amanhã, ${timeStr}${endTimeStr}`;
  return `${format(start, "EEE, dd 'de' MMM", { locale: ptBR })}, ${timeStr}${endTimeStr}`;
}

type ViewMode = 'lista' | 'semana';

interface NewEventForm {
  title: string;
  description: string;
  event_type: AgendaEventType;
  start_date: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  location: string;
  meeting_url: string;
}

const DEFAULT_FORM: NewEventForm = {
  title: '',
  description: '',
  event_type: 'compromisso',
  start_date: format(new Date(), 'yyyy-MM-dd'),
  start_time: '09:00',
  end_time: '10:00',
  all_day: false,
  location: '',
  meeting_url: '',
};

function buildISOString(date: string, time: string) {
  return `${date}T${time}:00`;
}

// Renders a compact weekly calendar grid showing upcoming 7 days
function WeekView({ events }: { events: AgendaEvent[] }) {
  const today = startOfDay(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day) => {
        const dayEvents = events.filter((e) => isSameDay(new Date(e.start_at), day));
        const isCurrentDay = isToday(day);

        return (
          <div key={day.toISOString()} className="min-h-[120px]">
            <div className={cn(
              'mb-1 rounded-md p-1 text-center text-xs font-medium',
              isCurrentDay ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}>
              <div>{format(day, 'EEE', { locale: ptBR })}</div>
              <div className="text-sm font-bold">{format(day, 'd')}</div>
            </div>
            <div className="space-y-1">
              {dayEvents.map((ev) => (
                <div
                  key={ev.id}
                  title={ev.title}
                  className={cn(
                    'truncate rounded px-1 py-0.5 text-xs',
                    EVENT_TYPE_COLORS[ev.event_type],
                  )}
                >
                  {!ev.all_day && (
                    <span className="mr-1 opacity-70">{format(new Date(ev.start_at), 'HH:mm')}</span>
                  )}
                  {ev.title}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Agenda() {
  const { events, isLoading, createEvent, deleteEvent, refetch } = useAgendaData();
  const [viewMode, setViewMode] = useState<ViewMode>('lista');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<NewEventForm>(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);

  // For the weekly view, show current week; for list view, show upcoming events
  const now = new Date();
  const weekStart = startOfWeek(now, { locale: ptBR });
  const weekEnd = endOfWeek(now, { locale: ptBR });

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const matchesType = typeFilter === 'all' || ev.event_type === typeFilter;
      return matchesType;
    });
  }, [events, typeFilter]);

  const upcomingEvents = useMemo(() => {
    return filteredEvents
      .filter((ev) => !isPast(endOfDay(new Date(ev.start_at))))
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [filteredEvents]);

  const weekEvents = useMemo(() => {
    return filteredEvents.filter((ev) => {
      const d = new Date(ev.start_at);
      return d >= weekStart && d <= weekEnd;
    });
  }, [filteredEvents, weekStart, weekEnd]);

  const handleDelete = async (eventId: string) => {
    const ok = await deleteEvent(eventId);
    if (ok) {
      toast.success('Evento removido.');
    } else {
      toast.error('Não foi possível remover o evento.');
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error('O título é obrigatório.');
      return;
    }
    if (!form.start_date) {
      toast.error('A data é obrigatória.');
      return;
    }

    setIsSaving(true);

    const start_at = form.all_day
      ? `${form.start_date}T00:00:00`
      : buildISOString(form.start_date, form.start_time);

    const end_at = form.all_day
      ? undefined
      : buildISOString(form.start_date, form.end_time);

    const ok = await createEvent({
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      event_type: form.event_type,
      start_at,
      end_at,
      all_day: form.all_day,
      location: form.location.trim() || undefined,
      meeting_url: form.meeting_url.trim() || undefined,
    });
    setIsSaving(false);

    if (ok) {
      toast.success('Evento criado com sucesso.');
      setForm(DEFAULT_FORM);
      setIsDialogOpen(false);
      refetch();
    } else {
      toast.error('Não foi possível criar o evento.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Gerencie compromissos, reuniões, WebAulas e rotinas recorrentes. Preparado para futura integração com Microsoft Teams.
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo evento
        </Button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(EVENT_TYPE_LABELS) as AgendaEventType[]).map((type) => (
          <span key={type} className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', EVENT_TYPE_COLORS[type])}>
            {EVENT_TYPE_LABELS[type]}
          </span>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo de evento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {(Object.keys(EVENT_TYPE_LABELS) as AgendaEventType[]).map((t) => (
              <SelectItem key={t} value={t}>{EVENT_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Views */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="lista" className="gap-1.5">
            <List className="h-4 w-4" />
            Lista
          </TabsTrigger>
          <TabsTrigger value="semana" className="gap-1.5">
            <CalendarDays className="h-4 w-4" />
            Semana
          </TabsTrigger>
        </TabsList>

        {/* List view – upcoming events */}
        <TabsContent value="lista" className="space-y-3">
          {upcomingEvents.length === 0 ? (
            <Card className="border-dashed shadow-none">
              <CardContent className="py-12 text-center">
                <Calendar className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="text-lg font-medium">Nenhum evento próximo</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {typeFilter !== 'all' ? 'Ajuste o filtro para ver outros eventos.' : 'Adicione compromissos, reuniões ou WebAulas.'}
                </p>
                {typeFilter === 'all' && (
                  <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar evento
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            upcomingEvents.map((ev) => (
              <Card key={ev.id} className={cn('border-l-4 shadow-sm transition-shadow hover:shadow-md', EVENT_TYPE_BORDER[ev.event_type])}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{ev.title}</p>
                        <Badge className={cn('border-none text-xs', EVENT_TYPE_COLORS[ev.event_type])}>
                          {EVENT_TYPE_LABELS[ev.event_type]}
                        </Badge>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatEventDate(ev.start_at, ev.end_at, ev.all_day)}
                        </span>
                        {ev.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {ev.location}
                          </span>
                        )}
                        {ev.meeting_url && (
                          <a
                            href={ev.meeting_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <Video className="h-3.5 w-3.5" />
                            Link da reunião
                          </a>
                        )}
                        {ev.participants.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {ev.participants.length} participante{ev.participants.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {ev.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{ev.description}</p>
                      )}
                    </div>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" title="Excluir evento" className="shrink-0 text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir evento</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação remove o evento da agenda e não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => void handleDelete(ev.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Weekly view */}
        <TabsContent value="semana">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Semana de {format(weekStart, "dd 'de' MMM", { locale: ptBR })} a {format(weekEnd, "dd 'de' MMM", { locale: ptBR })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WeekView events={weekEvents} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New Event Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo evento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ev-title">Título <span className="text-destructive">*</span></Label>
              <Input
                id="ev-title"
                placeholder="Nome do evento..."
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-type">Tipo</Label>
              <Select value={form.event_type} onValueChange={(v) => setForm((f) => ({ ...f, event_type: v as AgendaEventType }))}>
                <SelectTrigger id="ev-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EVENT_TYPE_LABELS) as AgendaEventType[]).map((t) => (
                    <SelectItem key={t} value={t}>{EVENT_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ev-date">Data <span className="text-destructive">*</span></Label>
                <Input
                  id="ev-date"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div className="flex items-end">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="ev-allday"
                    checked={form.all_day}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, all_day: Boolean(v) }))}
                  />
                  <Label htmlFor="ev-allday" className="cursor-pointer">Dia inteiro</Label>
                </div>
              </div>
            </div>

            {!form.all_day && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ev-start">Início</Label>
                  <Input
                    id="ev-start"
                    type="time"
                    value={form.start_time}
                    onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-end">Término</Label>
                  <Input
                    id="ev-end"
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ev-location">Local</Label>
              <Input
                id="ev-location"
                placeholder="Sala, endereço ou plataforma..."
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-url">Link da reunião</Label>
              <Input
                id="ev-url"
                type="url"
                placeholder="https://..."
                value={form.meeting_url}
                onChange={(e) => setForm((f) => ({ ...f, meeting_url: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-description">Descrição</Label>
              <Textarea
                id="ev-description"
                placeholder="Detalhes, pauta ou observações..."
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsDialogOpen(false); setForm(DEFAULT_FORM); }}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={isSaving}>
              {isSaving && <Spinner className="mr-2 h-4 w-4" onAccent />}
              Criar evento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
