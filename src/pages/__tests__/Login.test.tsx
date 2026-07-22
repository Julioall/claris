import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import Login from '@/pages/Login';

const loginMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ login: loginMock, isLoading: false }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function renderPage() {
  return render(<MemoryRouter><Login /></MemoryRouter>);
}

describe('Login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loginMock.mockResolvedValue(true);
  });

  it('validates required Claris credentials', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
    expect(screen.getByText(/preencha todos os campos/i)).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('logs in with email and Claris password without Moodle routing fields', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'Tutor@Example.test');
    await userEvent.type(screen.getByLabelText(/^senha$/i), 'claris-password');
    await userEvent.click(screen.getByRole('button', { name: /^entrar$/i }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('Tutor@Example.test', 'claris-password'));
    expect(navigateMock).toHaveBeenCalledWith('/');
    expect(screen.queryByText(/conecte-se ao moodle/i)).not.toBeInTheDocument();
  });

  it('toggles password visibility and exposes recovery', async () => {
    renderPage();
    const input = screen.getByLabelText(/^senha$/i);
    await userEvent.click(screen.getByRole('button', { name: /mostrar senha/i }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('link', { name: /esqueci minha senha/i })).toHaveAttribute('href', '/forgot-password');
  });

  it('does not navigate on authentication failure', async () => {
    loginMock.mockResolvedValue(false);
    renderPage();
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'tutor@example.test');
    await userEvent.type(screen.getByLabelText(/^senha$/i), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
    await waitFor(() => expect(loginMock).toHaveBeenCalledTimes(1));
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
