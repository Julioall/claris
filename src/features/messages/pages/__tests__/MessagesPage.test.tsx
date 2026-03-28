import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import MessagesPage from '@/features/messages/pages/MessagesPage';

const useChatMock = vi.fn();
const fetchConversationsMock = vi.fn();

vi.mock('@/features/claris/hooks/useChat', () => ({
  useChat: () => useChatMock(),
}));

vi.mock('@/features/claris/components/ChatWindow', () => ({
  ChatWindow: ({
    studentName,
    moodleUserId,
  }: {
    studentName: string;
    moodleUserId: number;
  }) => (
    <div data-testid="chat-window">
      {studentName}:{moodleUserId}
    </div>
  ),
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <MessagesPage />
    </MemoryRouter>,
  );
}

describe('Messages page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchConversationsMock.mockResolvedValue(undefined);
    useChatMock.mockReturnValue({
      conversations: [
        {
          id: 1,
          member: { id: 11, fullname: 'Ana Silva' },
          unreadcount: 2,
          studentId: 's-1',
          lastMessage: {
            text: '<p>Mensagem recente da Ana</p>',
            timecreated: Math.floor(Date.now() / 1000),
          },
        },
        {
          id: 2,
          member: { id: 22, fullname: 'Bruno Souza' },
          unreadcount: 0,
          studentId: null,
          lastMessage: null,
        },
      ],
      isLoadingConversations: false,
      isRefreshingConversations: false,
      conversationsError: null,
      fetchConversations: fetchConversationsMock,
    });
  });

  it('fetches conversations on mount', async () => {
    renderPage();

    await waitFor(() => {
      expect(fetchConversationsMock).toHaveBeenCalledTimes(1);
    });
  });

  it('renders error banner when hook returns an error', () => {
    useChatMock.mockReturnValue({
      conversations: [],
      isLoadingConversations: false,
      isRefreshingConversations: false,
      conversationsError: 'Falha ao buscar',
      fetchConversations: fetchConversationsMock,
    });

    renderPage();

    expect(screen.getByText(/erro ao carregar conversas/i)).toBeInTheDocument();
    expect(screen.getByText(/falha ao buscar/i)).toBeInTheDocument();
  });

  it('filters conversations by search query', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getAllByText('Ana Silva').length).toBeGreaterThan(0);
    expect(screen.getByText('Bruno Souza')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/buscar conversa/i), 'ana');

    expect(screen.getAllByText('Ana Silva').length).toBeGreaterThan(0);
    expect(screen.queryByText('Bruno Souza')).not.toBeInTheDocument();
  });

  it('shows the selected conversation and profile link', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /ana silva/i }));

    expect(screen.getByTestId('chat-window')).toHaveTextContent('Ana Silva:11');
    expect(screen.getByRole('link', { name: /ver perfil/i })).toHaveAttribute('href', '/alunos/s-1');
  });

  it('removes links to bulk send and templates from the messages header', () => {
    renderPage();

    expect(screen.queryByRole('link', { name: /envio em massa/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /modelos/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /envio em massa/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /modelos/i })).not.toBeInTheDocument();
  });
});
