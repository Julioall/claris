import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { CalendarEvent, Task } from '@/types';
import { buildAgendaItems, getAgendaItemsOnDate, type AgendaItem } from '@/lib/agenda';
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '@/lib/tasks';
import { AGENDA_TASK_APPEARANCE, CALENDAR_EVENT_APPEARANCE } from './agenda-item-appearance';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  addMonths,
  subMonths,
  isToday,
  isSameDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, monthIndex) => {
  const rawMonthLabel = format(new Date(2026, monthIndex, 1), 'MMMM', { locale: ptBR });
  return {
    value: String(monthIndex),
    label: rawMonthLabel.charAt(0).toUpperCase() + rawMonthLabel.slice(1),
  };
});

interface AgendaCalendarViewProps {
  events: CalendarEvent[];
  tasks?: Task[];
  onEdit: (event: CalendarEvent) => void;
  onDelete: (id: string) => void;
  onCreateOnDate?: (dateStr: string) => void;
  onTaskClick?: (task: Task) => void;
}

function getAgendaItemAppearance(item: AgendaItem) {
  if (item.kind === 'event') {
    return CALENDAR_EVENT_APPEARANCE[item.event.type] ?? CALENDAR_EVENT_APPEARANCE.other;
  }

  return AGENDA_TASK_APPEARANCE;
}

function getAgendaItemMeta(item: AgendaItem) {
  if (item.kind === 'event') {
    const startLabel = format(new Date(item.event.start_at), 'HH:mm');
    const endLabel = item.event.end_at ? format(new Date(item.event.end_at), 'HH:mm') : null;
    return endLabel ? `${startLabel} → ${endLabel}` : startLabel;
  }

  return `${TASK_STATUS_LABELS[item.task.status]} · ${TASK_PRIORITY_LABELS[item.task.priority]}`;
}

export function AgendaCalendarView({
  events,
  tasks = [],
  onEdit,
  onCreateOnDate,
  onTaskClick,
}: AgendaCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const agendaItems = useMemo(() => buildAgendaItems(events, tasks), [events, tasks]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const dayKey = (day: Date) => format(day, 'yyyy-MM-dd');

  const itemsOnDay = (day: Date) => getAgendaItemsOnDate(agendaItems, dayKey(day));

  const selectedDayItems = selectedDate ? itemsOnDay(selectedDate) : [];
  const yearOptions = useMemo(() => {
    const referenceYears = agendaItems.map((item) => new Date(item.startsAt).getFullYear());
    referenceYears.push(currentMonth.getFullYear(), new Date().getFullYear());

    const minYear = Math.min(...referenceYears) - 1;
    const maxYear = Math.max(...referenceYears) + 1;

    return Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index);
  }, [agendaItems, currentMonth]);

  const prevMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
    setSelectedDate(null);
  };

  const nextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
    setSelectedDate(null);
  };

  const goToday = () => {
    setCurrentMonth(startOfMonth(new Date()));
    setSelectedDate(new Date());
  };

  const handleMonthSelect = (monthValue: string) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), Number(monthValue), 1));
    setSelectedDate(null);
  };

  const handleYearSelect = (yearValue: string) => {
    setCurrentMonth(new Date(Number(yearValue), currentMonth.getMonth(), 1));
    setSelectedDate(null);
  };

  const handleDayClick = (day: Date) => {
    setSelectedDate((previousDate) => (previousDate && isSameDay(previousDate, day) ? null : day));
  };

  const handleCreateOnDate = (day: Date) => {
    if (onCreateOnDate) {
      const localDate = format(day, "yyyy-MM-dd'T'08:00");
      onCreateOnDate(localDate);
    }
  };

  const handleItemClick = (item: AgendaItem) => {
    if (item.kind === 'event') {
      onEdit(item.event);
      return;
    }

    onTaskClick?.(item.task);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Select value={String(currentMonth.getMonth())} onValueChange={handleMonthSelect}>
            <SelectTrigger aria-label="Selecionar mes" className="h-8 w-40 text-xs">
              <SelectValue placeholder="Mes" />
            </SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map((month) => (
                <SelectItem key={month.value} value={month.value}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(currentMonth.getFullYear())} onValueChange={handleYearSelect}>
            <SelectTrigger aria-label="Selecionar ano" className="h-8 w-28 text-xs">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={goToday} className="h-8 px-2 text-xs">
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

      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="py-2 text-center text-[11px] font-medium text-muted-foreground">
              {weekday}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            const dayItems = itemsOnDay(day);
            const isCurrentMonthDay = isSameMonth(day, currentMonth);
            const isSelected = Boolean(selectedDate) && isSameDay(day, selectedDate);
            const isTodayCell = isToday(day);

            return (
              <div
                key={index}
                onClick={() => handleDayClick(day)}
                className={cn(
                  'group relative min-h-[80px] cursor-pointer border-b border-r p-1 transition-colors hover:bg-muted/40',
                  !isCurrentMonthDay && 'bg-muted/20',
                  isSelected && 'bg-primary/5',
                  isTodayCell && 'ring-2 ring-primary/30 ring-inset',
                  (index + 1) % 7 === 0 && 'border-r-0',
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium',
                      isTodayCell && 'bg-primary text-primary-foreground',
                      !isTodayCell && !isCurrentMonthDay && 'text-muted-foreground/50',
                      !isTodayCell && isCurrentMonthDay && 'text-foreground',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {onCreateOnDate && isCurrentMonthDay && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleCreateOnDate(day);
                      }}
                      title="Novo evento"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                <div className="mt-0.5 space-y-0.5">
                  {dayItems.slice(0, 3).map((item) => {
                    const appearance = getAgendaItemAppearance(item);

                    return (
                      <button
                        key={`${item.kind}-${item.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleItemClick(item);
                        }}
                        className={cn(
                          'w-full truncate rounded border px-1 py-0.5 text-left text-[10px] font-medium transition-opacity hover:opacity-80',
                          appearance.tone,
                        )}
                        title={item.title}
                      >
                        {item.title}
                      </button>
                    );
                  })}
                  {dayItems.length > 3 && (
                    <span className="block pl-1 text-[10px] text-muted-foreground">
                      +{dayItems.length - 3} mais
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </h3>
            {onCreateOnDate && (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => handleCreateOnDate(selectedDate)}>
                <Plus className="h-3 w-3" />
                Novo evento
              </Button>
            )}
          </div>

          {selectedDayItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum compromisso neste dia.</p>
          ) : (
            <div className="space-y-2">
              {selectedDayItems.map((item) => {
                const appearance = getAgendaItemAppearance(item);
                const Icon = appearance.icon;

                return (
                  <button
                    key={`${item.kind}-${item.id}`}
                    type="button"
                    className="flex w-full items-start gap-3 rounded-lg border bg-card p-3 text-left transition-shadow hover:shadow-sm"
                    onClick={() => handleItemClick(item)}
                  >
                    <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border', appearance.tone)}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.description && (
                        <p className="line-clamp-1 text-xs text-muted-foreground">{item.description}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">{getAgendaItemMeta(item)}</span>
                        <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px]', appearance.tone)}>
                          {appearance.label}
                        </Badge>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
