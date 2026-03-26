import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MessageTemplatesTab } from '@/features/messages/components/MessageTemplatesTab';

const {
  useAuthMock,
  listMessageTemplatesForUserMock,
  createMessageTemplateMock,
  updateMessageTemplateMock,
  deleteMessageTemplateMock,
  setMessageTemplateFavoriteMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  listMessageTemplatesForUserMock: vi.fn(),
  createMessageTemplateMock: vi.fn(),
  updateMessageTemplateMock: vi.fn(),
  deleteMessageTemplateMock: vi.fn(),
  setMessageTemplateFavoriteMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock('@/features/messages/api/message-templates.repository', () => ({
  listMessageTemplatesForUser: listMessageTemplatesForUserMock,
  createMessageTemplate: createMessageTemplateMock,
  updateMessageTemplate: updateMessageTemplateMock,
  deleteMessageTemplate: deleteMessageTemplateMock,
  setMessageTemplateFavorite: setMessageTemplateFavoriteMock,
}));

describe('MessageTemplatesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({
      user: { id: 'user-1' },
    });

    listMessageTemplatesForUserMock.mockResolvedValue([]);
    createMessageTemplateMock.mockResolvedValue(undefined);
    updateMessageTemplateMock.mockResolvedValue(undefined);
    deleteMessageTemplateMock.mockResolvedValue(undefined);
    setMessageTemplateFavoriteMock.mockResolvedValue(undefined);

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
      },
    });
  });

  it('loads templates through the messages repository on mount', async () => {
    listMessageTemplatesForUserMock.mockResolvedValue([
      {
        id: 'tpl-1',
        title: 'Boas-vindas',
        content: 'Ola {nome_aluno}',
        category: 'geral',
        is_favorite: false,
        created_at: '2026-03-21T10:00:00.000Z',
        updated_at: '2026-03-21T10:00:00.000Z',
      },
    ]);

    render(<MessageTemplatesTab />);

    await waitFor(() => {
      expect(listMessageTemplatesForUserMock).toHaveBeenCalledWith('user-1');
    });

    expect(screen.getByText('Boas-vindas')).toBeInTheDocument();
    expect(screen.getByText(/\{nome_aluno\}/i)).toBeInTheDocument();
  });

  it('creates a new template through the repository', async () => {
    const user = userEvent.setup();

    render(<MessageTemplatesTab />);

    await waitFor(() => {
      expect(listMessageTemplatesForUserMock).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: /novo modelo/i }));
    await user.type(screen.getByPlaceholderText(/ex: lembrete de atividade/i), 'Lembrete de atividade');
    fireEvent.change(screen.getByPlaceholderText(/digite o texto do modelo/i), {
      target: {
        value: 'Ola {nome_aluno}, lembre-se da atividade.',
      },
    });
    await user.click(screen.getByRole('button', { name: /^criar$/i }));

    await waitFor(() => {
      expect(createMessageTemplateMock).toHaveBeenCalledWith('user-1', {
        title: 'Lembrete de atividade',
        content: 'Ola {nome_aluno}, lembre-se da atividade.',
        category: 'geral',
      });
    });

    expect(toastSuccessMock).toHaveBeenCalledWith('Modelo criado');
    expect(listMessageTemplatesForUserMock).toHaveBeenCalledTimes(2);
  });
});
