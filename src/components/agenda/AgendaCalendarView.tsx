import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Video, Users, AlignLeft, PackageCheck, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CalendarEvent, CalendarEventType } from '@/types';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  parseISO,
  addMonths,
  subMonths,
  isToday,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TYPE_CONFIG: Record<CalendarEventType, { label: string; icon: React.ElementType; chip: string }> = {
  manual:    { label: 'Geral',        icon: AlignLeft,   chip: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
  webclass:  { label: 'WebAula',      icon: Video,       chip: 'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200' },
  meeting:   { label: 'Reunião',      icon: Users,       chip: 'bg-violet-200 text-violet-800 dark:bg-violet-800 dark:text-violet-200' },
  alignment: { label: 'Alinhamento',  icon: Users,       chip: 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200' },
  delivery:  { label: 'Entrega',      icon: PackageCheck, chip: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200' },
  other:     { label: 'Outro',        icon: HelpCircle,  chip: 'bg-muted text-muted-foreground' },
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface AgendaCalendarViewProps {
  events: CalendarEvent[];
  onEdit: (event: CalendarEvent) => void;
  onDelete: (id: string) => void;
  onCreateOnDate?: (dateStr: string) => void;
}

export function AgendaCalendarView({ events, onEdit, onCreateOnDate }: AgendaCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const eventsOnDay = (day: Date) =>
    events.filter(ev => isSameDay(parseISO(ev.start_at), day));

  const selectedDayEvents = selectedDate ? eventsOnDay(selectedDate) : [];

  const prevMonth = () => { setCurrentMonth(subMonths(currentMonth, 1)); setSelectedDate(null); };
  const nextMonth = () => { setCurrentMonth(addMonths(currentMonth, 1)); setSelectedDate(null); };
  const goToday = () => { setCurrentMonth(startOfMonth(new Date())); setSelectedDate(new Date()); };

  const handleDayClick = (day: Date) => {
    setSelectedDate(prev => prev && isSameDay(prev, day) ? null : day);
  };

  const handleCreateOnDate = (day: Date) => {
    if (onCreateOnDate) {
      const localStr = format(day, "yyyy-MM-dd'T'08:00");
      onCreateOnDate(localStr);
    }
  };

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
        </h2>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={goToday} className="h-8 text-xs px-2">
            Hoje
          </Button>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {WEEKDAYS.map(wd => (
            <div key={wd} className="py-2 text-center text-[11px] font-medium text-muted-foreground">
              {wd}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            const dayEvents = eventsOnDay(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const today = isToday(day);

            return (
              <div
                key={idx}
                onClick={() => handleDayClick(day)}
                className={cn(
                  'group relative min-h-[80px] border-b border-r p-1 cursor-pointer transition-colors',
                  !isCurrentMonth && 'bg-muted/20',
                  isSelected && 'bg-primary/5',
                  today && 'ring-inset ring-2 ring-primary/30',
                  'hover:bg-muted/40',
                  // remove right border on last column
                  (idx + 1) % 7 === 0 && 'border-r-0',
                )}
              >
                {/* Day number */}
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium',
                      today && 'bg-primary text-primary-foreground',
                      !today && !isCurrentMonth && 'text-muted-foreground/50',
                      !today && isCurrentMonth && 'text-foreground',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {onCreateOnDate && isCurrentMonth && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-4 w-4 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                      onClick={e => { e.stopPropagation(); handleCreateOnDate(day); }}
                      title="Novo evento"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {/* Event chips */}
                <div className="mt-0.5 space-y-0.5">
                  {dayEvents.slice(0, 3).map(ev => {
                    const cfg = TYPE_CONFIG[ev.type] ?? TYPE_CONFIG.other;
                    return (
                      <button
                        key={ev.id}
                        onClick={e => { e.stopPropagation(); onEdit(ev); }}
                        className={cn(
                          'w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium transition-opacity hover:opacity-80',
                          cfg.chip,
                        )}
                        title={ev.title}
                      >
                        {ev.title}
                      </button>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <span className="block text-[10px] text-muted-foreground pl-1">
                      +{dayEvents.length - 3} mais
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day events */}
      {selectedDate && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </h3>
            {onCreateOnDate && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleCreateOnDate(selectedDate)}>
                <Plus className="h-3 w-3" />
                Novo evento
              </Button>
            )}
          </div>

          {selectedDayEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum evento neste dia.</p>
          ) : (
            <div className="space-y-2">
              {selectedDayEvents.map(ev => {
                const cfg = TYPE_CONFIG[ev.type] ?? TYPE_CONFIG.other;
                const Icon = cfg.icon;
                return (
                  <div
                    key={ev.id}
                    className="flex items-start gap-3 rounded-lg border bg-card p-3 hover:shadow-sm transition-shadow cursor-pointer"
                    onClick={() => onEdit(ev)}
                  >
                    <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', cfg.chip)}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{ev.title}</p>
                      {ev.description && <p className="text-xs text-muted-foreground line-clamp-1">{ev.description}</p>}
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(ev.start_at), 'HH:mm')}
                          {ev.end_at && ` → ${format(parseISO(ev.end_at), 'HH:mm')}`}
                        </span>
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', cfg.chip)}>
                          {cfg.label}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
