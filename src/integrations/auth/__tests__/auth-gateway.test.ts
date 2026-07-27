import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  refreshSession: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  setSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: authMock },
}));

import { authGateway, AuthSessionMissingError } from '../auth-gateway';

const rawSession = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  user: { id: 'user-1', email: 'user@example.test' },
};

describe('authGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.getSession.mockResolvedValue({ data: { session: rawSession }, error: null });
    authMock.refreshSession.mockResolvedValue({
      data: { session: { ...rawSession, access_token: 'access-2' } },
      error: null,
    });
    authMock.setSession.mockResolvedValue({ error: null });
    authMock.exchangeCodeForSession.mockResolvedValue({ data: { session: rawSession }, error: null });
    authMock.resetPasswordForEmail.mockResolvedValue({ error: null });
    authMock.signInWithPassword.mockResolvedValue({ data: { session: rawSession }, error: null });
    authMock.signOut.mockResolvedValue({ error: null });
    authMock.updateUser.mockResolvedValue({ error: null });
  });

  it('maps the provider session to a stable application contract', async () => {
    await expect(authGateway.getSession()).resolves.toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'user-1', email: 'user@example.test' },
    });
  });

  it('refreshes missing and explicitly stale access tokens', async () => {
    authMock.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(authGateway.getAccessToken()).resolves.toBe('access-2');
    await expect(authGateway.getAccessToken(true)).resolves.toBe('access-2');
    expect(authMock.refreshSession).toHaveBeenCalledTimes(2);
  });

  it('supports an optional unauthenticated request', async () => {
    authMock.getSession.mockResolvedValue({ data: { session: null }, error: null });
    authMock.refreshSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(authGateway.getAccessToken(false, false)).resolves.toBeNull();
    await expect(authGateway.getAccessToken(false, true)).rejects.toBeInstanceOf(AuthSessionMissingError);
  });

  it('maps auth state events and returns an unsubscribe function', () => {
    const unsubscribe = vi.fn();
    let providerListener: ((event: string, session: typeof rawSession | null) => void) | undefined;
    authMock.onAuthStateChange.mockImplementation((listener) => {
      providerListener = listener;
      return { data: { subscription: { unsubscribe } } };
    });
    const listener = vi.fn();

    const stop = authGateway.onAuthStateChange(listener);
    providerListener?.('SIGNED_IN', rawSession);
    stop();

    expect(listener).toHaveBeenCalledWith('SIGNED_IN', expect.objectContaining({ accessToken: 'access-1' }));
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('accepts password updates on the reset route only after a recovery auth event', () => {
    let providerListener: ((event: string, session: typeof rawSession | null) => void) | undefined;
    authMock.onAuthStateChange.mockImplementation((listener) => {
      providerListener = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    authGateway.onAuthStateChange(vi.fn());
    providerListener?.('SIGNED_IN', rawSession);
    expect(authGateway.consumePasswordRecoverySession()).toBeNull();

    providerListener?.('PASSWORD_RECOVERY', rawSession);
    expect(authGateway.consumePasswordRecoverySession()).toMatchObject({ user: { id: 'user-1' } });
    expect(authGateway.consumePasswordRecoverySession()).toBeNull();
  });

  it('maps session writes and sign-out scope', async () => {
    await authGateway.setSession({ accessToken: 'access-new', refreshToken: 'refresh-new' });
    await authGateway.signOut('local');

    expect(authMock.setSession).toHaveBeenCalledWith({
      access_token: 'access-new',
      refresh_token: 'refresh-new',
    });
    expect(authMock.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('exposes Claris password login, recovery, invite exchange and password update', async () => {
    await expect(authGateway.signInWithPassword('user@example.test', 'claris-password'))
      .resolves.toMatchObject({ user: { id: 'user-1' } });
    await authGateway.resetPasswordForEmail('user@example.test', 'https://claris.test/reset-password');
    await authGateway.exchangeCodeForSession('one-time-code');
    await authGateway.updatePassword('new-claris-password');

    expect(authMock.signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.test', password: 'claris-password',
    });
    expect(authMock.resetPasswordForEmail).toHaveBeenCalledWith('user@example.test', {
      redirectTo: 'https://claris.test/reset-password',
    });
    expect(authMock.updateUser).toHaveBeenCalledWith({ password: 'new-claris-password' });
  });
});
