import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskKanbanBoard } from '../TaskKanbanBoard';
import type { Task } from '@/features/tasks/types';

function createDataTransfer(): DataTransfer {
  const data = new Map<string, string>();

  return {
    dropEffect: 'move',
    effectAllowed: 'all',
    files: [],
    items: [],
    types: [],
    clearData: (format?: string) => {
      if (format) {
        data.delete(format);
      } else {
        data.clear();
      }
    },
    getData: (format: string) => data.get(format) ?? '',
    setData: (format: string, value: string) => {
      data.set(format, value);
    },
    setDragImage: vi.fn(),
  } as unknown as DataTransfer;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Preparar devolutiva',
    status: 'todo',
    priority: 'medium',
    created_at: '2026-03-20T10:00:00.000Z',
    updated_at: '2026-03-20T10:00:00.000Z',
    tags: [],
    ai_tags: [],
    ...overrides,
  };
}

describe('TaskKanbanBoard', () => {
  it('move tarefa para outra coluna via drag and drop', () => {
    const onStatusChange = vi.fn();

    render(
      <TaskKanbanBoard
        tasks={[makeTask()]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onStatusChange={onStatusChange}
        onTaskClick={vi.fn()}
      />
    );

    const card = screen.getByText('Preparar devolutiva').closest('[draggable="true"]');
    const doneColumn = screen.getByRole('region', { name: /coluna conclu/i });
    const dataTransfer = createDataTransfer();

    expect(card).not.toBeNull();

    fireEvent.dragStart(card as HTMLElement, { dataTransfer });
    fireEvent.dragOver(doneColumn, { dataTransfer });
    fireEvent.drop(doneColumn, { dataTransfer });

    expect(onStatusChange).toHaveBeenCalledWith('task-1', 'done');
  });

  it('ignora drop na mesma coluna', () => {
    const onStatusChange = vi.fn();

    render(
      <TaskKanbanBoard
        tasks={[makeTask({ status: 'in_progress' })]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onStatusChange={onStatusChange}
        onTaskClick={vi.fn()}
      />
    );

    const card = screen.getByText('Preparar devolutiva').closest('[draggable="true"]');
    const sameColumn = screen.getByRole('region', { name: /coluna em andamento/i });
    const dataTransfer = createDataTransfer();

    expect(card).not.toBeNull();

    fireEvent.dragStart(card as HTMLElement, { dataTransfer });
    fireEvent.dragOver(sameColumn, { dataTransfer });
    fireEvent.drop(sameColumn, { dataTransfer });

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('aplica cursor de pegar enquanto a tarefa pode ser arrastada', () => {
    render(
      <TaskKanbanBoard
        tasks={[makeTask()]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onStatusChange={vi.fn()}
        onTaskClick={vi.fn()}
      />
    );

    const card = screen.getByText('Preparar devolutiva').closest('[draggable="true"]');

    expect(card).not.toBeNull();
    expect(card).toHaveClass('cursor-grab');
  });
});
