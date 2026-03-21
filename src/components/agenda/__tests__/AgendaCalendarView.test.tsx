import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgendaCalendarView } from '../AgendaCalendarView';
import type { CalendarEvent } from '@/features/agenda/types';
import type { Task } from '@/features/tasks/types';

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'event-1',
    title: 'Reuniao de alinhamento',
    start_at: '2026-03-20T09:00:00-03:00',
    end_at: '2026-03-20T09:30:00-03:00',
    type: 'alignment',
    external_source: 'manual',
    created_at: '2026-03-20T08:00:00.000Z',
    updated_at: '2026-03-20T08:00:00.000Z',
    ...overrides,
  };
}

describe('AgendaCalendarView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renderiza seletores de mes e ano no cabecalho do calendario', () => {
    render(
      <AgendaCalendarView
        events={[makeEvent()]}
        tasks={[] as Task[]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCreateOnDate={vi.fn()}
      />,
    );

    const monthSelect = screen.getByRole('combobox', { name: /selecionar mes/i });
    const yearSelect = screen.getByRole('combobox', { name: /selecionar ano/i });

    expect(monthSelect).toHaveTextContent(/mar/i);
    expect(yearSelect).toHaveTextContent('2026');
  });
});
