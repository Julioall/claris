import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useChat } from '@/features/claris/hooks/useChat';

const useAuthMock = vi.fn();
const fetchMoodleConversationsMock = vi.fn();
const fetchMoodleMessagesMock = vi.fn();
const sendMoodleMessageMock = vi.fn();
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
let authUserCounter = 0;
const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/features/claris/api/moodle-messaging', () => ({
  fetchMoodleConversations: (...args: unknown[]) => fetchMoodleConversationsMock(...args),
  fetchMoodleMessages: (...args: unknown[]) => fetchMoodleMessagesMock(...args),
  sendMoodleMessage: (...args: unknown[]) => sendMoodleMessageMock(...args),
}));

vi.mock('@/hooks/useTrackEvent', () => ({
  useTrackEvent: () => ({ track: vi.fn() }),
}));

vi.mock('@/hooks/useErrorLog', () => ({
  useErrorLog: () => ({ logError: vi.fn() }),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function messagesResponse(text: string) {
  return {
    contractVersion: 1 as const,
    conversationId: 7,
    currentMoodleUserId: 10,
    items: [{
      id: '1',
      text,
      createdAtUnix: 100,
      senderMoodleUserId: 20,
      senderType: 'student' as const,
    }],
  };
}

describe('useChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();

    authUserCounter += 1;
    const userId = `user-${authUserCounter}`;
    useAuthMock.mockReturnValue({ user: { id: userId } });
    window.sessionStorage.setItem(`claris:selected-moodle-connection:${userId}`, CONNECTION_ID);
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it('uses the typed backend response with an already scoped student id', async () => {
    fetchMoodleConversationsMock.mockResolvedValueOnce({
      contractVersion: 1,
      currentMoodleUserId: 10,
      items: [{
        id: 7,
        member: { id: 20, fullName: 'Ana Silva', profileImageUrl: null },
        lastMessage: { text: 'Oi', createdAtUnix: 1700 },
        unreadCount: 2,
        studentId: 'student-1',
      }],
    });

    const { result } = renderHook(() => useChat());
    await act(async () => result.current.fetchConversations());

    expect(fetchMoodleConversationsMock).toHaveBeenCalledWith(CONNECTION_ID);
    expect(result.current.currentMoodleUserId).toBe(10);
    expect(result.current.conversations).toEqual([{
      id: 7,
      member: { id: 20, fullname: 'Ana Silva' },
      lastMessage: { text: 'Oi', timecreated: 1700 },
      unreadcount: 2,
      studentId: 'student-1',
    }]);
  });

  it('fetches normalized messages without sending browser Moodle credentials', async () => {
    fetchMoodleMessagesMock.mockResolvedValueOnce({
      contractVersion: 1,
      conversationId: 7,
      currentMoodleUserId: 10,
      items: [
        {
          id: '1',
          text: 'Mensagem 1',
          createdAtUnix: 100,
          senderMoodleUserId: 20,
          senderType: 'student',
        },
        {
          id: '2',
          text: 'Mensagem 2',
          createdAtUnix: 200,
          senderMoodleUserId: 10,
          senderType: 'tutor',
        },
      ],
    });

    const { result } = renderHook(() => useChat());
    await act(async () => result.current.fetchMessages(20, 10));

    expect(fetchMoodleMessagesMock).toHaveBeenCalledWith(CONNECTION_ID, 20, 10);
    expect(result.current.messages).toEqual([
      {
        id: '1',
        text: 'Mensagem 1',
        timecreated: 100,
        useridfrom: 20,
        senderType: 'student',
      },
      {
        id: '2',
        text: 'Mensagem 2',
        timecreated: 200,
        useridfrom: 10,
        senderType: 'tutor',
      },
    ]);
  });

  it('treats a missing Moodle conversation as an empty chat from the backend', async () => {
    fetchMoodleMessagesMock.mockResolvedValueOnce({
      contractVersion: 1,
      conversationId: null,
      currentMoodleUserId: 10,
      items: [],
    });

    const { result } = renderHook(() => useChat());
    await act(async () => result.current.fetchMessages(20));

    expect(result.current.messages).toEqual([]);
    expect(result.current.messagesError).toBeNull();
  });

  it('shows cached messages immediately while refreshing in background', async () => {
    fetchMoodleMessagesMock.mockResolvedValueOnce(messagesResponse('Mensagem em cache'));
    const refreshDeferred = createDeferred<ReturnType<typeof messagesResponse>>();
    fetchMoodleMessagesMock.mockReturnValueOnce(refreshDeferred.promise);

    const { result } = renderHook(() => useChat());
    await act(async () => result.current.fetchMessages(20));
    expect(result.current.messages[0]?.text).toBe('Mensagem em cache');

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.fetchMessages(20);
    });

    expect(result.current.isLoadingMessages).toBe(false);
    expect(result.current.isRefreshingMessages).toBe(true);
    expect(result.current.messages[0]?.text).toBe('Mensagem em cache');

    await act(async () => {
      refreshDeferred.resolve(messagesResponse('Mensagem atualizada'));
      await refreshPromise;
    });

    expect(result.current.messages[0]?.text).toBe('Mensagem atualizada');
    expect(result.current.isRefreshingMessages).toBe(false);
  });

  it('hydrates cached messages across hook instances after route changes', async () => {
    fetchMoodleMessagesMock.mockResolvedValueOnce(messagesResponse('Mensagem persistida'));
    const firstMount = renderHook(() => useChat());
    await act(async () => firstMount.result.current.fetchMessages(20));
    firstMount.unmount();

    const refreshDeferred = createDeferred<ReturnType<typeof messagesResponse>>();
    fetchMoodleMessagesMock.mockReturnValueOnce(refreshDeferred.promise);
    const reopened = renderHook(() => useChat());

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = reopened.result.current.fetchMessages(20);
    });

    expect(reopened.result.current.getCachedMessages(20)[0]?.text).toBe('Mensagem persistida');
    expect(reopened.result.current.messages[0]?.text).toBe('Mensagem persistida');
    expect(reopened.result.current.isRefreshingMessages).toBe(true);

    await act(async () => {
      refreshDeferred.resolve(messagesResponse('Mensagem persistida e atualizada'));
      await refreshPromise;
    });

    expect(reopened.result.current.messages[0]?.text).toBe('Mensagem persistida e atualizada');
  });

  it('sends a message through the typed client and appends it to the cache', async () => {
    fetchMoodleMessagesMock.mockResolvedValueOnce({
      contractVersion: 1,
      conversationId: null,
      currentMoodleUserId: 10,
      items: [],
    });
    sendMoodleMessageMock.mockResolvedValueOnce({ contractVersion: 1, messageId: '99' });

    const { result } = renderHook(() => useChat());
    await act(async () => result.current.fetchMessages(20));

    let sent = false;
    await act(async () => {
      sent = await result.current.sendMessage(20, '  mensagem enviada  ');
    });

    expect(sent).toBe(true);
    expect(sendMoodleMessageMock).toHaveBeenCalledWith(CONNECTION_ID, 20, 'mensagem enviada');
    expect(result.current.messages.at(-1)).toMatchObject({
      id: '99',
      text: 'mensagem enviada',
      useridfrom: 10,
      senderType: 'tutor',
    });
    expect(result.current.getCachedMessages(20).at(-1)).toMatchObject({
      id: '99',
      text: 'mensagem enviada',
    });
  });

  it('does not call the API without a local session or with a blank message', async () => {
    window.sessionStorage.clear();
    const { result } = renderHook(() => useChat());

    let noSessionResult = true;
    await act(async () => {
      noSessionResult = await result.current.sendMessage(20, 'texto');
    });
    expect(noSessionResult).toBe(false);
    expect(sendMoodleMessageMock).not.toHaveBeenCalled();

    const userId = `user-${authUserCounter}`;
    window.sessionStorage.setItem(`claris:selected-moodle-connection:${userId}`, CONNECTION_ID);
    const { result: withSession } = renderHook(() => useChat());
    let blankResult = true;
    await act(async () => {
      blankResult = await withSession.current.sendMessage(20, '   ');
    });
    expect(blankResult).toBe(false);
    expect(sendMoodleMessageMock).not.toHaveBeenCalled();
  });

  it('sets the conversation error when the typed client fails', async () => {
    fetchMoodleConversationsMock.mockRejectedValueOnce(new Error('request failed'));
    const { result } = renderHook(() => useChat());

    await act(async () => result.current.fetchConversations());
    await waitFor(() => expect(result.current.conversationsError).toBe('request failed'));
  });
});
