import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SettingsPage from '@/features/settings/pages/SettingsPage';
import { MESSAGE_PREFERENCES_STORAGE_KEY } from '@/features/messages/lib/message-preferences';

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const invokeMock = vi.fn();
const logoutMock = vi.fn();
const syncDataMock = vi.fn();

const selectMock = vi.fn();
const eqMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

const setAuthUser = () => {
  useAuthMock.mockReturnValue({
    user: {
      id: 'u-1',
      full_name: 'Julio Tutor',
      moodle_username: 'julio',
      email: 'julio@example.com',
    },
    logout: logoutMock,
    lastSync: '2026-02-20T12:00:00.000Z',
    syncData: syncDataMock,
    isSyncing: false,
    isOfflineMode: false,
    courses: [],
  });
};

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>,
  );
};

describe('Settings page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();

    logoutMock.mockResolvedValue(undefined);
    invokeMock.mockResolvedValue({
      data: {
        preferenceEnabled: false,
        credentialActive: false,
        requiresLogin: false,
      },
      error: null,
    });
    setAuthUser();

    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    eqMock.mockReturnValue({ maybeSingle: maybeSingleMock });
    selectMock.mockReturnValue({ eq: eqMock });
    fromMock.mockImplementation(() => ({
      select: selectMock,
    }));
  });

  it('shows profile, theme and sync for all users', async () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: /configuracoes/i })).toBeInTheDocument();
    expect(screen.getByText('Julio Tutor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sincronizacao Geral/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sair da conta/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /mensagens/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /limpeza operacional do banco/i })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fromMock).toHaveBeenCalledWith('app_settings');
    });
  });

  it('triggers initial general sync', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Sincronizacao Geral/i }));
    expect(syncDataMock).toHaveBeenCalledTimes(1);
  });

  it('shows the background job reauthorization preference and allows disabling it', async () => {
    const user = userEvent.setup();
    renderPage();

    const reauthSwitch = await screen.findByRole('switch', {
      name: /permitir reautorizacao automatica para jobs em segundo plano/i,
    });

    expect(reauthSwitch).toHaveAttribute('data-state', 'checked');

    await user.click(reauthSwitch);

    expect(invokeMock).toHaveBeenCalledWith('moodle-reauth-settings', {
      body: {
        enabled: false,
      },
    });
  });

  it('persists the send on Enter preference inside the messages tab', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('tab', { name: /mensagens/i }));

    const sendOnEnterSwitch = screen.getByRole('switch', {
      name: /enviar mensagem com enter/i,
    });

    expect(sendOnEnterSwitch).toHaveAttribute('data-state', 'unchecked');

    await user.click(sendOnEnterSwitch);

    expect(sendOnEnterSwitch).toHaveAttribute('data-state', 'checked');
    expect(window.localStorage.getItem(MESSAGE_PREFERENCES_STORAGE_KEY)).toBe('{"sendOnEnter":true}');
  });

  it('allows logout', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /sair da conta/i }));
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});
