import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENDA_GROUP_THIS_MONTH,
  AGENDA_GROUP_THIS_WEEK,
  buildAgendaItems,
  getAgendaItemsOnDate,
  groupAgendaItemsByPeriod,
} from '@/features/agenda/lib/agenda';
import type { CalendarEvent } from '@/features/agenda/types';
import type { Task } from '@/features/tasks/types';

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'event-1',
    title: 'Alinhamento',
    start_at: '2026-03-20T09:00:00-03:00',
    end_at: '2026-03-20T09:30:00-03:00',
    type: 'alignment',
    external_source: 'manual',
    created_at: '2026-03-20T08:00:00.000Z',
    updated_at: '2026-03-20T08:00:00.000Z',
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Preparar materiais',
    status: 'todo',
    priority: 'medium',
    due_date: '2026-03-20',
    created_at: '2026-03-20T08:00:00.000Z',
    updated_at: '2026-03-20T08:00:00.000Z',
    tags: [],
    ai_tags: [],
    ...overrides,
  };
}

describe('agenda helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds a mixed agenda sorted by time and task deadline', () => {
    const items = buildAgendaItems(
      [
        makeEvent({ id: 'event-early', start_at: '2026-03-20T09:00:00-03:00' }),
        makeEvent({ id: 'event-late', start_at: '2026-03-20T16:00:00-03:00' }),
      ],
      [
        makeTask({ id: 'task-due', due_date: '2026-03-20' }),
        makeTask({ id: 'task-no-date', due_date: null }),
      ],
    );

    expect(items.map((item) => `${item.kind}:${item.id}`)).toEqual([
      'event:event-early',
      'event:event-late',
      'task:task-due',
    ]);
  });

  it('returns only the items scheduled for the selected date', () => {
    const items = buildAgendaItems(
      [makeEvent({ id: 'event-1', start_at: '2026-03-20T09:00:00-03:00' })],
      [makeTask({ id: 'task-1', due_date: '2026-03-21' })],
    );

    expect(getAgendaItemsOnDate(items, '2026-03-20').map((item) => item.id)).toEqual(['event-1']);
    expect(getAgendaItemsOnDate(items, '2026-03-21').map((item) => item.id)).toEqual(['task-1']);
  });

  it('groups agenda items by the current period labels', () => {
    const items = buildAgendaItems(
      [
        makeEvent({ id: 'week-event', start_at: '2026-03-20T09:00:00-03:00' }),
        makeEvent({ id: 'month-event', start_at: '2026-03-28T09:00:00-03:00' }),
      ],
      [makeTask({ id: 'week-task', due_date: '2026-03-21' })],
    );

    const groups = groupAgendaItemsByPeriod(items);

    expect(groups[AGENDA_GROUP_THIS_WEEK]?.map((item) => item.id)).toEqual(['week-event', 'week-task']);
    expect(groups[AGENDA_GROUP_THIS_MONTH]?.map((item) => item.id)).toEqual(['month-event']);
  });
});
