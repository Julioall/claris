import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const searchTaskTagSuggestionsMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/tasks/api/task-tag-suggestions', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/tasks/api/task-tag-suggestions')>();
  return {
    ...original,
    searchTaskTagSuggestions: searchTaskTagSuggestionsMock,
  };
});

import { TaskTagInput } from '../TaskTagInput';

describe('TaskTagInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchTaskTagSuggestionsMock.mockResolvedValue([]);
  });

  it('loads domain suggestions and returns the selected entity', async () => {
    const onAdd = vi.fn();
    searchTaskTagSuggestionsMock.mockResolvedValueOnce([{
      entityId: 'student-1',
      entityType: 'aluno',
      label: 'Ana Silva',
      prefix: 'aluno',
    }]);
    render(<TaskTagInput tags={[]} onAdd={onAdd} onRemove={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/adicionar tag/i), {
      target: { value: '/aluno:Ana' },
    });

    expect(await screen.findByText('Ana Silva')).toBeInTheDocument();
    expect(searchTaskTagSuggestionsMock).toHaveBeenCalledWith(
      'aluno',
      'Ana',
      expect.any(AbortSignal),
    );

    fireEvent.click(screen.getByText('Ana Silva'));
    expect(onAdd).toHaveBeenCalledWith({
      entityId: 'student-1',
      entityType: 'aluno',
      label: 'Ana Silva',
      prefix: 'aluno',
    });
  });

  it('keeps lookup failures silent and leaves free tags usable', async () => {
    const onAdd = vi.fn();
    searchTaskTagSuggestionsMock.mockRejectedValueOnce(new Error('offline'));
    render(<TaskTagInput tags={[]} onAdd={onAdd} onRemove={vi.fn()} />);
    const input = screen.getByPlaceholderText(/adicionar tag/i);

    fireEvent.change(input, { target: { value: '/aluno:Ana' } });
    await waitFor(() => expect(searchTaskTagSuggestionsMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Ana Silva')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'prioridade' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith({ label: 'prioridade', entityType: 'custom' });
  });
});
