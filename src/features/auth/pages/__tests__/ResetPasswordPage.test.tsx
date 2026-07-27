import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import ResetPasswordPage from '../ResetPasswordPage';

const authGatewayMock = vi.hoisted(() => ({
  consumePasswordRecoverySession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  updatePassword: vi.fn(),
}));
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/auth/auth-gateway', () => ({ authGateway: authGatewayMock }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const recoverySession = {
  accessToken: 'access',
  refreshToken: 'refresh',
  user: { id: 'claris-user', email: 'tutor@example.test' },
};

function renderPage(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGatewayMock.consumePasswordRecoverySession.mockReturnValue(null);
    authGatewayMock.exchangeCodeForSession.mockResolvedValue(recoverySession);
    authGatewayMock.onAuthStateChange.mockReturnValue(vi.fn());
    authGatewayMock.signOut.mockResolvedValue(undefined);
    authGatewayMock.updatePassword.mockResolvedValue(undefined);
  });

  it('does not accept an ordinary signed-in session as a password-recovery proof', async () => {
    authGatewayMock.onAuthStateChange.mockImplementation((listener) => {
      listener('SIGNED_IN', recoverySession);
      return vi.fn();
    });

    renderPage('/reset-password');

    await waitFor(() => expect(screen.getByText(/link de recuperacao e invalido/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /salvar nova senha/i })).toBeDisabled();
    expect(authGatewayMock.updatePassword).not.toHaveBeenCalled();
  });

  it('permits a password update after the Supabase recovery event', async () => {
    authGatewayMock.consumePasswordRecoverySession
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(recoverySession);
    authGatewayMock.onAuthStateChange.mockImplementation((listener) => {
      listener('PASSWORD_RECOVERY', recoverySession);
      return vi.fn();
    });

    renderPage('/reset-password?code=recovery-code');

    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('button', { name: /salvar nova senha/i })).toBeEnabled());
    await user.type(screen.getByLabelText(/nova senha/i), 'nova-senha-segura');
    await user.type(screen.getByLabelText(/confirmar senha/i), 'nova-senha-segura');
    await user.click(screen.getByRole('button', { name: /salvar nova senha/i }));

    await waitFor(() => expect(authGatewayMock.updatePassword).toHaveBeenCalledWith('nova-senha-segura'));
    expect(authGatewayMock.exchangeCodeForSession).toHaveBeenCalledWith('recovery-code');
    expect(authGatewayMock.signOut).toHaveBeenCalledWith('local');
    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
  });
});
