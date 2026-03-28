import { forwardRef, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatWindow } from '@/features/claris/components/ChatWindow';

const useChatMock = vi.fn();
const fetchMessagesMock = vi.fn();
const sendMessageMock = vi.fn();

vi.mock('@/features/claris/hooks/useChat', () => ({
  useChat: () => useChatMock(),
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: forwardRef<HTMLDivElement, { children: ReactNode }>(
    ({ children }, ref) => (
      <div ref={ref}>
        <div data-radix-scroll-area-viewport>{children}</div>
      </div>
    ),
  ),
}));

describe('ChatWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();

    useChatMock.mockReturnValue({
      messages: [
        {
          id: 'm-1',
          senderType: 'tutor',
          text: '<p>Ola aluno</p>',
          timecreated: Math.floor(Date.now() / 1000),
          useridfrom: 1,
        },
      ],
      activeMessagesUserId: '123',
      messagesError: null,
      isLoadingMessages: false,
      isRefreshingMessages: false,
      isSending: false,
      fetchMessages: fetchMessagesMock,
      sendMessage: sendMessageMock,
      getCachedMessages: () => [],
    });
    fetchMessagesMock.mockResolvedValue(undefined);
    sendMessageMock.mockResolvedValue(true);
  });

  it('fetches messages on mount and shows chat header', async () => {
    render(<ChatWindow moodleUserId={123} studentName="Ana Silva" />);

    expect(screen.getByText(/chat com ana silva/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMessagesMock).toHaveBeenCalledWith(123);
    });
  });

  it('renders loading and error states', () => {
    useChatMock.mockReturnValue({
      messages: [],
      activeMessagesUserId: '123',
      messagesError: null,
      isLoadingMessages: true,
      isRefreshingMessages: false,
      isSending: false,
      fetchMessages: fetchMessagesMock,
      sendMessage: sendMessageMock,
      getCachedMessages: () => [],
    });
    const { rerender, container } = render(<ChatWindow moodleUserId={123} studentName="Ana Silva" />);

    expect(container.querySelector('[data-testid="spinner"]')).toBeInTheDocument();

    useChatMock.mockReturnValue({
      messages: [],
      activeMessagesUserId: '123',
      messagesError: 'Falha no chat',
      isLoadingMessages: false,
      isRefreshingMessages: false,
      isSending: false,
      fetchMessages: fetchMessagesMock,
      sendMessage: sendMessageMock,
      getCachedMessages: () => [],
    });
    rerender(<ChatWindow moodleUserId={123} studentName="Ana Silva" />);

    expect(screen.getByText(/falha no chat/i)).toBeInTheDocument();
  });

  it('renders empty-state message list', () => {
    useChatMock.mockReturnValue({
      messages: [],
      activeMessagesUserId: '123',
      messagesError: null,
      isLoadingMessages: false,
      isRefreshingMessages: false,
      isSending: false,
      fetchMessages: fetchMessagesMock,
      sendMessage: sendMessageMock,
      getCachedMessages: () => [],
    });
    render(<ChatWindow moodleUserId={123} studentName="Ana Silva" />);

    expect(screen.getByText(/nenhuma mensagem ainda/i)).toBeInTheDocument();
  });

  it('does not send on Enter while the preference is disabled', async () => {
    const user = userEvent.setup();
    render(<ChatWindow moodleUserId={123} studentName="Ana Silva" />);

    const input = screen.getByPlaceholderText(/digite sua mensagem/i);
    await user.type(input, 'Teste{enter}');

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('sends a message and clears input when using the button', async () => {
    const user = userEvent.setup();
    render(<ChatWindow moodleUserId={123} studentName="Ana Silva" />);

    const input = screen.getByPlaceholderText(/digite sua mensagem/i);
    await user.type(input, 'Teste de envio');
    await user.click(screen.getByRole('button', { name: /enviar mensagem/i }));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(123, 'Teste de envio');
    });
    expect(input).toHaveValue('');
  });
});
