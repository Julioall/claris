import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Agenda from '@/features/agenda/pages/AgendaPage';
import type { CalendarEvent } from '@/features/agenda/types';
import type { Task } from '@/features/tasks/types';

const useCalendarEventsMock = vi.fn();
const useTasksMock = vi.fn();

vi.mock('@/features/agenda/hooks/useCalendarEvents', () => ({
  useCalendarEvents: (...args: unknown[]) => useCalendarEventsMock(...args),
}));

vi.mock('@/features/tasks/hooks/useTasks', () => ({
  useTasks: (...args: unknown[]) => useTasksMock(...args),
}));

vi.mock('@/components/agenda/AgendaCalendarView', () => ({
  AgendaCalendarView: ({ events, tasks }: { events: CalendarEvent[]; tasks: Task[] }) => (
    <div data-testid="agenda-calendar">
      {`eventos:${events.length}-tarefas:${tasks.length}`}
    </div>
  ),
}));

vi.mock('@/components/agenda/CalendarEventCard', () => ({
  CalendarEventCard: ({ event }: { event: CalendarEvent }) => <div data-testid="agenda-event-card">{event.title}</div>,
}));

vi.mock('@/components/agenda/AgendaTaskCard', () => ({
  AgendaTaskCard: ({ task }: { task: Task }) => <div data-testid="agenda-task-card">{task.title}</div>,
}));

vi.mock('@/components/agenda/CalendarEventForm', () => ({
  CalendarEventForm: () => <div data-testid="calendar-event-form" />,
}));

vi.mock('@/components/tasks/TaskDetailDrawer', () => ({
  TaskDetailDrawer: () => null,
}));

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'event-1',
    title: 'WebAula',
    start_at: '2026-03-20T09:00:00-03:00',
    end_at: '2026-03-20T10:00:00-03:00',
    type: 'webclass',
    external_source: 'manual',
    created_at: '2026-03-20T08:00:00.000Z',
    updated_at: '2026-03-20T08:00:00.000Z',
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Preparar pauta',
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

describe('Agenda page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useCalendarEventsMock.mockReturnValue({
      events: [makeEvent()],
      isLoading: false,
      createEvent: vi.fn(),
      updateEvent: vi.fn(),
      deleteEvent: vi.fn(),
      isCreating: false,
    });

    useTasksMock.mockReturnValue({
      tasks: [makeTask()],
      isLoading: false,
    });
  });

  it('opens in calendar mode and sends tasks to the calendar view', () => {
    render(<Agenda />);

    expect(screen.getByTestId('agenda-calendar')).toHaveTextContent('eventos:1-tarefas:1');
    expect(screen.queryByTestId('agenda-event-card')).not.toBeInTheDocument();
  });

  it('renders events and tasks in the secondary list view', async () => {
    const user = userEvent.setup();

    render(<Agenda />);

    await user.click(screen.getByRole('button', { name: /lista/i }));

    expect(screen.getByTestId('agenda-event-card')).toHaveTextContent('WebAula');
    expect(screen.getByTestId('agenda-task-card')).toHaveTextContent('Preparar pauta');
  });
});
