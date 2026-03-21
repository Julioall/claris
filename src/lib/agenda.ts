import { format, isFuture, isThisMonth, isThisWeek, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { CalendarEvent, Task } from '@/types';

export const AGENDA_GROUP_THIS_WEEK = 'Esta semana';
export const AGENDA_GROUP_THIS_MONTH = 'Este mes';
export const AGENDA_GROUP_PAST = 'Passados';

export type AgendaItem =
  | {
      kind: 'event';
      id: string;
      title: string;
      description?: string | null;
      dateKey: string;
      startsAt: string;
      sortValue: string;
      event: CalendarEvent;
    }
  | {
      kind: 'task';
      id: string;
      title: string;
      description?: string | null;
      dateKey: string;
      startsAt: string;
      sortValue: string;
      task: Task;
    };

function toDateKey(value: string): string {
  return format(parseISO(value), 'yyyy-MM-dd');
}

export function buildAgendaItems(events: CalendarEvent[], tasks: Task[]): AgendaItem[] {
  const eventItems: AgendaItem[] = events.map((event) => ({
    kind: 'event',
    id: event.id,
    title: event.title,
    description: event.description,
    dateKey: toDateKey(event.start_at),
    startsAt: event.start_at,
    sortValue: event.start_at,
    event,
  }));

  const taskItems: AgendaItem[] = tasks
    .filter((task) => Boolean(task.due_date))
    .map((task) => ({
      kind: 'task',
      id: task.id,
      title: task.title,
      description: task.description,
      dateKey: toDateKey(task.due_date!),
      startsAt: task.due_date!,
      sortValue: `${task.due_date}T23:59:59`,
      task,
    }));

  return [...eventItems, ...taskItems].sort((left, right) => left.sortValue.localeCompare(right.sortValue));
}

export function getAgendaItemsOnDate(items: AgendaItem[], dateKey: string): AgendaItem[] {
  return items.filter((item) => item.dateKey === dateKey);
}

export function groupAgendaItemsByPeriod(items: AgendaItem[]): Record<string, AgendaItem[]> {
  const groups: Record<string, AgendaItem[]> = {};

  for (const item of items) {
    const date = parseISO(item.startsAt);
    let key: string;

    if (isThisWeek(date, { locale: ptBR })) {
      key = AGENDA_GROUP_THIS_WEEK;
    } else if (isThisMonth(date)) {
      key = AGENDA_GROUP_THIS_MONTH;
    } else if (isFuture(date)) {
      const rawLabel = format(date, 'MMMM yyyy', { locale: ptBR });
      key = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
    } else {
      key = AGENDA_GROUP_PAST;
    }

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(item);
  }

  return groups;
}

export function sortAgendaGroupKeys(groups: Record<string, AgendaItem[]>) {
  const keys = Object.keys(groups);

  keys.sort((left, right) => {
    if (left === AGENDA_GROUP_THIS_WEEK) return -1;
    if (right === AGENDA_GROUP_THIS_WEEK) return 1;
    if (left === AGENDA_GROUP_THIS_MONTH) return -1;
    if (right === AGENDA_GROUP_THIS_MONTH) return 1;
    if (left === AGENDA_GROUP_PAST) return 1;
    if (right === AGENDA_GROUP_PAST) return -1;
    return left.localeCompare(right, 'pt-BR');
  });

  return keys;
}
