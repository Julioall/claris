import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { BackgroundActivityProvider } from '@/contexts/BackgroundActivityContext';

const gateway = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));
const toastMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/auth/auth-gateway', () => ({ authGateway: gateway }));
vi.mock('@/hooks/use-toast', () => ({ toast: toastMock }));
vi.mock('@/lib/tracking', () => ({ trackEvent: vi.fn(async () => undefined), logError: vi.fn(async () => undefined) }));
vi.mock('@/features/auth/api/moodle-sync-jobs', () => ({
  listActiveMoodleSyncJobs: vi.fn(async () => []),
  listAvailableMoodleCourses: vi.fn(async () => []),
  startInitialMoodleSync: vi.fn(),
  startCourseMoodleSync: vi.fn(),
  waitForMoodleSyncJob: vi.fn(),
}));

const session = {
  accessToken: 'access',
  refreshToken: 'refresh',
  user: { id: 'claris-user', email: 'tutor@example.test', fullName: 'Tutor Claris' },
};
let authRef: ReturnType<typeof useAuth> | null = null;
let queryClient: QueryClient;

function Probe() {
  authRef = useAuth();
  return null;
}

function renderProvider() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BackgroundActivityProvider><AuthProvider><Probe /></AuthProvider></BackgroundActivityProvider>
    </QueryClientProvider>,
  );
}

describe('AuthContext with independent Claris account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRef = null;
    sessionStorage.clear();
    localStorage.clear();
    gateway.getSession.mockResolvedValue(null);
    gateway.onAuthStateChange.mockReturnValue(vi.fn());
    gateway.signOut.mockResolvedValue(undefined);
  });

  it('throws outside the provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/useAuth must be used within an AuthProvider/i);
    consoleError.mockRestore();
  });

  it('hydrates identity from Supabase Auth without a Moodle session snapshot', async () => {
    gateway.getSession.mockResolvedValue(session);
    renderProvider();
    await waitFor(() => expect(authRef?.user).toMatchObject({
      id: 'claris-user', full_name: 'Tutor Claris', email: 'tutor@example.test',
    }));
    expect(sessionStorage.getItem('session')).toBeNull();
  });

  it('logs in only with Claris email/password', async () => {
    gateway.signInWithPassword.mockResolvedValue(session);
    renderProvider();
    await waitFor(() => expect(authRef?.isLoading).toBe(false));
    await act(async () => expect(await authRef!.login('Tutor@Example.test', 'claris-password')).toBe(true));
    expect(gateway.signInWithPassword).toHaveBeenCalledWith('tutor@example.test', 'claris-password');
    expect(authRef?.user?.full_name).toBe('Tutor Claris');
  });

  it('uses a generic failure that does not disclose account existence', async () => {
    gateway.signInWithPassword.mockRejectedValue(new Error('user not found'));
    renderProvider();
    await waitFor(() => expect(authRef?.isLoading).toBe(false));
    await act(async () => expect(await authRef!.login('missing@example.test', 'wrong')).toBe(false));
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      description: 'E-mail ou senha invalidos.', variant: 'destructive',
    }));
  });

  it('clears account-scoped local state on logout', async () => {
    gateway.getSession.mockResolvedValue(session);
    localStorage.setItem('claris_chat_history:claris-user', 'private');
    sessionStorage.setItem('claris_moodle_chat_cache:claris-user%3Aconnection-fieg', 'private');
    renderProvider();
    await waitFor(() => expect(authRef?.user?.id).toBe('claris-user'));
    queryClient.setQueryData(['private-query'], { account: 'claris-user' });
    await act(async () => authRef!.logout());
    expect(gateway.signOut).toHaveBeenCalled();
    expect(localStorage.getItem('claris_chat_history:claris-user')).toBeNull();
    expect(sessionStorage.getItem('claris_moodle_chat_cache:claris-user%3Aconnection-fieg')).toBeNull();
    expect(queryClient.getQueryData(['private-query'])).toBeUndefined();
  });

  it('resets sync state and cached responses when the authenticated account changes', async () => {
    const secondSession = {
      ...session,
      user: { id: 'claris-user-2', email: 'second@example.test', fullName: 'Segunda Conta' },
    };
    let stateListener: ((event: string, nextSession: typeof session | typeof secondSession | null) => void) | undefined;
    gateway.getSession.mockResolvedValue(session);
    gateway.onAuthStateChange.mockImplementation((listener) => {
      stateListener = listener;
      return vi.fn();
    });
    sessionStorage.setItem('claris:selected-moodle-connection:claris-user', 'connection-a');
    sessionStorage.setItem('claris:selected-moodle-connection:claris-user-2', 'connection-b');

    renderProvider();
    await waitFor(() => expect(authRef?.user?.id).toBe('claris-user'));
    await act(async () => authRef!.setCourses([{ id: 'course-a' } as never]));
    queryClient.setQueryData(['private-query'], { account: 'claris-user' });

    await act(async () => stateListener?.('SIGNED_IN', secondSession));

    await waitFor(() => expect(authRef?.user?.id).toBe('claris-user-2'));
    expect(authRef?.courses).toEqual([]);
    expect(queryClient.getQueryData(['private-query'])).toBeUndefined();
  });
});
