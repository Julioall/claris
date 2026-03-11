import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewPendingTaskDialog } from '@/components/pending-tasks/NewPendingTaskDialog';

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const pendingTasksInsertMock = vi.fn();
const recurrenceInsertMock = vi.fn();
const recurrenceSelectMock = vi.fn();
const recurrenceSingleMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({ onSelect }: { onSelect?: (date: Date) => void }) => (
    <button type="button" onClick={() => onSelect?.(new Date('2026-03-20T00:00:00.000Z'))}>
      pick-date
    </button>
  ),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function renderDialog(props: Partial<ComponentProps<typeof NewPendingTaskDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  render(
    <NewPendingTaskDialog
      open
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
      {...props}
    />,
  );

  return { onOpenChange, onSuccess };
}

async function selectOption(label: RegExp, optionName: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: optionName }));
}

describe('NewPendingTaskDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: 'user-1' } });

    fromMock.mockImplementation((table: string) => {
      if (table === 'pending_tasks') {
        return { insert: pendingTasksInsertMock };
      }

      if (table === 'task_recurrence_configs') {
        return { insert: recurrenceInsertMock };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    pendingTasksInsertMock.mockResolvedValue({ error: null });
    recurrenceInsertMock.mockReturnValue({ select: recurrenceSelectMock });
    recurrenceSelectMock.mockReturnValue({ single: recurrenceSingleMock });
    recurrenceSingleMock.mockResolvedValue({ data: { id: 'r-1' }, error: null });
  });

  it('creates a manual task without recurrence', async () => {
    const user = userEvent.setup();
    const { onOpenChange, onSuccess } = renderDialog();

    await user.type(
      screen.getByPlaceholderText(/revisar engajamento semanal/i),
      '  Nova pendencia importante  ',
    );
    await user.type(
      screen.getByPlaceholderText(/observacoes, proximos passos/i),
      'Ligar para a turma na sexta.',
    );
    await user.click(screen.getByRole('button', { name: /criar tarefa/i }));

    await waitFor(() => {
      expect(pendingTasksInsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Nova pendencia importante',
          description: 'Ligar para a turma na sexta.',
          course_id: null,
          student_id: null,
          category_name: null,
          task_type: 'interna',
          status: 'aberta',
          priority: 'media',
          created_by_user_id: 'user-1',
          automation_type: 'manual',
          recurrence_id: null,
          is_recurring: false,
        }),
      );
    });

    expect(recurrenceInsertMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringMatching(/tarefa criada/i));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('creates a recurring weekly routine linked to the first task', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(
      screen.getByPlaceholderText(/revisar engajamento semanal/i),
      'Revisar engajamento semanal',
    );
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: /^Prazo$/i }));
    await user.click(await screen.findByRole('button', { name: /pick-date/i }));
    await selectOption(/^Dia da semana$/i, /Sexta-feira/i);
    await user.click(screen.getByRole('button', { name: /criar tarefa/i }));

    await waitFor(() => {
      expect(recurrenceInsertMock).toHaveBeenCalled();
    });

    expect(recurrenceInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Revisar engajamento semanal',
        pattern: 'semanal',
        weekly_day: 5,
        start_date: '2026-03-20T00:00:00.000Z',
        next_generation_at: '2026-03-27T00:00:00.000Z',
      }),
    );
    expect(pendingTasksInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Revisar engajamento semanal',
        automation_type: 'recurring',
        recurrence_id: 'r-1',
        is_recurring: true,
        due_date: '2026-03-20T00:00:00.000Z',
      }),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringMatching(/rotina criada/i));
  });

  it('shows a validation error when weekly day does not match the first occurrence date', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(
      screen.getByPlaceholderText(/revisar engajamento semanal/i),
      'Rotina desalinhada',
    );
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: /^Prazo$/i }));
    await user.click(await screen.findByRole('button', { name: /pick-date/i }));
    await selectOption(/^Dia da semana$/i, /Segunda-feira/i);
    await user.click(screen.getByRole('button', { name: /criar tarefa/i }));

    expect(await screen.findByText(/precisa cair no dia da semana selecionado/i)).toBeInTheDocument();
    expect(recurrenceInsertMock).not.toHaveBeenCalled();
    expect(pendingTasksInsertMock).not.toHaveBeenCalled();
  });

  it('shows an error toast when the user is not authenticated', async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({ user: null });
    renderDialog();

    await user.type(
      screen.getByPlaceholderText(/revisar engajamento semanal/i),
      'Pendencia sem sessao',
    );
    await user.click(screen.getByRole('button', { name: /criar tarefa/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/estar logado/i));
    });

    expect(pendingTasksInsertMock).not.toHaveBeenCalled();
  });
});
