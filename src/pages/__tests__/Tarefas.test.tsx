import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Tarefas from '@/features/tasks/pages/TasksPage';
import type { Task } from '@/features/tasks/types';

const useTasksMock = vi.fn();

vi.mock('@/features/tasks/hooks/useTasks', () => ({
  useTasks: (...args: unknown[]) => useTasksMock(...args),
}));

vi.mock('@/components/tasks/TaskKanbanBoard', () => ({
  TaskKanbanBoard: ({ tasks }: { tasks: Task[] }) => (
    <div data-testid="task-kanban">{tasks.map((task) => task.title).join('|')}</div>
  ),
}));

vi.mock('@/components/tasks/TaskCard', () => ({
  TaskCard: ({ task }: { task: Task }) => <div data-testid="task-card">{task.title}</div>,
}));

vi.mock('@/components/tasks/TaskForm', () => ({
  TaskForm: () => <div data-testid="task-form" />,
}));

vi.mock('@/components/tasks/TaskDetailDrawer', () => ({
  TaskDetailDrawer: () => null,
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Tarefa de hoje',
    status: 'todo',
    priority: 'medium',
    due_date: '2026-03-20',
    created_at: '2026-03-20T09:00:00.000Z',
    updated_at: '2026-03-20T09:00:00.000Z',
    tags: [],
    ai_tags: [],
    ...overrides,
  };
}

describe('Tarefas page', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T12:00:00'));
    vi.clearAllMocks();

    useTasksMock.mockReturnValue({
      tasks: [
        makeTask(),
        makeTask({ id: 'task-2', title: 'Tarefa da semana', due_date: '2026-03-21' }),
        makeTask({ id: 'task-3', title: 'Tarefa sem data', due_date: null }),
      ],
      isLoading: false,
      createTask: vi.fn(),
      updateTask: vi.fn(),
      deleteTask: vi.fn(),
      isCreating: false,
      isUpdating: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens in kanban mode and applies the day filter by default', () => {
    render(<Tarefas />);

    expect(screen.getByTestId('task-kanban')).toHaveTextContent('Tarefa de hoje');
    expect(screen.getByTestId('task-kanban')).not.toHaveTextContent('Tarefa da semana');
    expect(screen.queryByTestId('task-card')).not.toBeInTheDocument();
  });

  it('uses the list view as a secondary rendering of the current filtered tasks', () => {
    render(<Tarefas />);

    fireEvent.click(screen.getByRole('button', { name: /lista/i }));
    expect(screen.getAllByTestId('task-card')).toHaveLength(1);
    expect(screen.getByTestId('task-card')).toHaveTextContent('Tarefa de hoje');
  });
});
