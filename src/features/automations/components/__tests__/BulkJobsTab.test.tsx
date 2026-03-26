import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BulkJobsTab } from '@/features/automations/components/BulkJobsTab';
import { createTestQueryClient } from '@/test/query-client';
import { QueryClientProvider } from '@tanstack/react-query';

const { useAuthMock, listBulkJobsMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  listBulkJobsMock: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/features/automations/api/automations.repository', () => ({
  listBulkJobs: listBulkJobsMock,
}));

vi.mock('@/features/automations/components/JobDetailDialog', () => ({
  JobDetailDialog: ({ jobId }: { jobId: string | null }) => (
    <div data-testid="job-detail-dialog">{jobId ?? 'closed'}</div>
  ),
}));

function renderTab() {
  const queryClient = createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <BulkJobsTab />
    </QueryClientProvider>,
  );
}

describe('BulkJobsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({
      user: { id: 'user-1' },
    });

    listBulkJobsMock.mockResolvedValue([
      {
        id: 'job-1',
        message_content: 'Primeiro envio em massa',
        total_recipients: 10,
        sent_count: 4,
        failed_count: 0,
        origin: 'manual',
        status: 'processing',
        created_at: '2026-03-21T10:00:00.000Z',
        started_at: '2026-03-21T10:01:00.000Z',
        completed_at: null,
        error_message: null,
        template_id: null,
        user_id: 'user-1',
      },
      {
        id: 'job-2',
        message_content: 'Segundo aviso importante',
        total_recipients: 5,
        sent_count: 5,
        failed_count: 0,
        origin: 'ia',
        status: 'completed',
        created_at: '2026-03-20T10:00:00.000Z',
        started_at: '2026-03-20T10:01:00.000Z',
        completed_at: '2026-03-20T10:05:00.000Z',
        error_message: null,
        template_id: null,
        user_id: 'user-1',
      },
    ]);
  });

  it('loads jobs through the automations repository and filters by search', async () => {
    const user = userEvent.setup();

    renderTab();

    await waitFor(() => {
      expect(listBulkJobsMock).toHaveBeenCalledWith('all');
    });

    expect(screen.getByText(/primeiro envio em massa/i)).toBeInTheDocument();
    expect(screen.getByText(/segundo aviso importante/i)).toBeInTheDocument();
    expect(screen.getByText(/^manual$/i)).toBeInTheDocument();
    expect(screen.getByText(/claris ia/i)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/buscar por conte/i), 'segundo');

    expect(screen.queryByText(/primeiro envio em massa/i)).not.toBeInTheDocument();
    expect(screen.getByText(/segundo aviso importante/i)).toBeInTheDocument();
  });

  it('opens the job detail dialog for the selected job', async () => {
    const user = userEvent.setup();

    renderTab();

    await waitFor(() => {
      expect(screen.getByText(/primeiro envio em massa/i)).toBeInTheDocument();
    });

    await user.click(screen.getAllByTitle(/ver detalhes/i)[0]);

    expect(screen.getByTestId('job-detail-dialog')).toHaveTextContent('job-1');
  });
});
