import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataCleanupCard } from '@/features/settings/components/DataCleanupCard';
import { CLEANUP_OPTIONS } from '@/features/settings/lib/cleanup-options';

const useAuthMock = vi.fn();
const toastMock = vi.fn();
const cleanupDataMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/features/settings/api/cleanup', () => ({
  cleanupData: (...args: unknown[]) => cleanupDataMock(...args),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

describe('DataCleanupCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({
      setCourses: vi.fn(),
    });

    cleanupDataMock.mockResolvedValue({
      contractVersion: 1,
      operationId: '00000000-0000-4000-8000-000000000099',
      success: true,
      completedSelectionIds: [],
      errors: [],
    });
  });

  it('selects and deselects all cleanup options', async () => {
    const user = userEvent.setup();
    render(<DataCleanupCard />);

    const cleanupButton = screen.getByRole('button', {
      name: /Limpar selecionados/i,
    });
    expect(cleanupButton).toHaveTextContent('(0)');
    expect(cleanupButton).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Selecionar tudo/i }));
    expect(cleanupButton).toHaveTextContent(`(${CLEANUP_OPTIONS.length})`);
    expect(cleanupButton).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /Desmarcar tudo/i }));
    expect(cleanupButton).toHaveTextContent('(0)');
    expect(cleanupButton).toBeDisabled();
  });

  it('executes cleanup and clears courses cache when a course-linked option is selected', async () => {
    const user = userEvent.setup();
    const setCoursesMock = vi.fn();
    useAuthMock.mockReturnValue({ setCourses: setCoursesMock });

    render(<DataCleanupCard />);

    await user.click(screen.getByLabelText(/^Cursos e vinculos$/i));
    await user.click(screen.getByRole('button', { name: /Limpar selecionados/i }));
    await user.click(screen.getByRole('button', { name: /Sim, limpar dados/i }));

    await waitFor(() => {
      expect(cleanupDataMock).toHaveBeenCalledWith(
        expect.objectContaining({
          confirmed: true,
          mode: 'selected_cleanup',
          selectionIds: ['course_catalog'],
        }),
      );
    });

    expect(setCoursesMock).toHaveBeenCalledWith([]);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/concluida/i),
      }),
    );
  });

  it('shows destructive toast when backend reports partial cleanup failure', async () => {
    const user = userEvent.setup();
    cleanupDataMock.mockResolvedValue({
      contractVersion: 1,
      operationId: '00000000-0000-4000-8000-000000000099',
      success: false,
      completedSelectionIds: [],
      errors: [{ selectionId: 'background_jobs', error: 'fail background_jobs' }],
    });

    render(<DataCleanupCard />);

    await user.click(screen.getByLabelText(/^Background jobs$/i));
    await user.click(screen.getByRole('button', { name: /Limpar selecionados/i }));
    await user.click(screen.getByRole('button', { name: /Sim, limpar dados/i }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });

    const lastToastCall = toastMock.mock.calls.at(-1)?.[0] as
      | { description?: string; variant?: string; title?: string }
      | undefined;

    expect(lastToastCall?.title).toMatch(/parcial/i);
    expect(lastToastCall?.variant).toBe('destructive');
    expect(lastToastCall?.description).toContain('Background jobs: fail background_jobs');
  });
});
