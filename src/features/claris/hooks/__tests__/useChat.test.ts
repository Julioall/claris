import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useChat } from '@/features/claris/hooks/useChat';

const useAuthMock = vi.fn();
const useMoodleSessionMock = vi.fn();
const invokeMock = vi.fn();
const fromMock = vi.fn();
const selectStudentsMock = vi.fn();
const inStudentsMock = vi.fn();
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
let authUserCounter = 0;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/features/auth/context/MoodleSessionContext', () => ({
  useMoodleSession: () => useMoodleSessionMock(),
}));

vi.mock('@/hooks/useTrackEvent', () => ({
  useTrackEvent: () => ({ track: vi.fn() }),
}));

vi.mock('@/hooks/useErrorLog', () => ({
  useErrorLog: () => ({ logError: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
    from: (...args: unknown[]) => fromMock(...args),
  },
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

function setupStudentsChain() {
  selectStudentsMock.mockReturnValue({ in: inStudentsMock });
  fromMock.mockImplementation((table: string) => {
    if (table === 'students') {
      return {
        select: selectStudentsMock,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe('useChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();

    authUserCounter += 1;
    useAuthMock.mockReturnValue({
      user: {
        id: `user-${authUserCounter}`,
      },
    });

    useMoodleSessionMock.mockReturnValue({
      moodleUrl: 'https://moodle.example.com',
      moodleToken: 'token-123',
    });

    setupStudentsChain();
    inStudentsMock.mockResolvedValue({ data: [], error: null });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it('fetches conversations and maps Moodle users to student ids', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        current_user_id: 10,
        conversations: [
          {
            id: 7,
            members: [
              { id: 10, fullname: 'Tutor' },
              { id: 20, fullname: 'Ana Silva' },
            ],
            messages: [{ text: 'Oi', timecreated: 1700 }],
            unreadcount: 2,
          },
        ],
      },
      error: null,
    });

    inStudentsMock.mockResolvedValueOnce({
      data: [{ id: 'student-1', moodle_user_id: '20' }],
      error: null,
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.fetchConversations();
    });

    expect(invokeMock).toHaveBeenCalledWith('moodle-messaging', {
      body: {
        action: 'get_conversations',
        moodleUrl: 'https://moodle.example.com',
        token: 'token-123',
      },
    });
    expect(result.current.currentMoodleUserId).toBe(10);
    expect(result.current.conversations).toEqual([
      {
        id: 7,
        member: { id: 20, fullname: 'Ana Silva' },
        lastMessage: { text: 'Oi', timecreated: 1700 },
        unreadcount: 2,
        studentId: 'student-1',
      },
    ]);
  });

  it('fetches and sorts messages with sender type', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        current_user_id: 10,
        messages: [
          { id: 2, text: 'Mensagem 2', timecreated: 200, useridfrom: 10 },
          { id: 1, text: 'Mensagem 1', timecreated: 100, useridfrom: 20 },
        ],
      },
      error: null,
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.fetchMessages(20, 10);
    });

    expect(invokeMock).toHaveBeenCalledWith('moodle-messaging', {
      body: {
        action: 'get_messages',
        moodleUrl: 'https://moodle.example.com',
        token: 'token-123',
        moodle_user_id: 20,
        limit_num: 10,
      },
    });
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

  it('treats missing conversation as empty chat instead of surfacing a function error', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(JSON.stringify({ error: 'Conversa nao existe' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      },
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.fetchMessages(20);
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.messagesError).toBeNull();
  });

  it('shows cached messages immediately while refreshing in background', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        current_user_id: 10,
        messages: [
          { id: 1, text: 'Mensagem em cache', timecreated: 100, useridfrom: 20 },
        ],
      },
      error: null,
    });

    const refreshDeferred = createDeferred<{
      data: {
        current_user_id: number;
        messages: Array<{ id: number; text: string; timecreated: number; useridfrom: number }>;
      };
      error: null;
    }>();

    invokeMock.mockReturnValueOnce(refreshDeferred.promise);

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.fetchMessages(20);
    });

    expect(result.current.messages[0]?.text).toBe('Mensagem em cache');

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.fetchMessages(20);
    });

    expect(result.current.isLoadingMessages).toBe(false);
    expect(result.current.isRefreshingMessages).toBe(true);
    expect(result.current.messages[0]?.text).toBe('Mensagem em cache');

    await act(async () => {
      refreshDeferred.resolve({
        data: {
          current_user_id: 10,
          messages: [
            { id: 1, text: 'Mensagem atualizada', timecreated: 100, useridfrom: 20 },
          ],
        },
        error: null,
      });
      await refreshPromise;
    });

    expect(result.current.messages[0]?.text).toBe('Mensagem atualizada');
    expect(result.current.isRefreshingMessages).toBe(false);
  });

  it('hydrates cached messages across hook instances after route changes', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        current_user_id: 10,
        messages: [
          { id: 1, text: 'Mensagem persistida', timecreated: 100, useridfrom: 20 },
        ],
      },
      error: null,
    });

    const firstMount = renderHook(() => useChat());

    await act(async () => {
      await firstMount.result.current.fetchMessages(20);
    });

    firstMount.unmount();

    const refreshDeferred = createDeferred<{
      data: {
        current_user_id: number;
        messages: Array<{ id: number; text: string; timecreated: number; useridfrom: number }>;
      };
      error: null;
    }>();

    invokeMock.mockReturnValueOnce(refreshDeferred.promise);

    const reopened = renderHook(() => useChat());

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = reopened.result.current.fetchMessages(20);
    });

    expect(reopened.result.current.getCachedMessages(20)[0]?.text).toBe('Mensagem persistida');
    expect(reopened.result.current.messages[0]?.text).toBe('Mensagem persistida');
    expect(reopened.result.current.isRefreshingMessages).toBe(true);

    await act(async () => {
      refreshDeferred.resolve({
        data: {
          current_user_id: 10,
          messages: [
            { id: 1, text: 'Mensagem persistida e atualizada', timecreated: 100, useridfrom: 20 },
          ],
        },
        error: null,
      });
      await refreshPromise;
    });

    expect(reopened.result.current.messages[0]?.text).toBe('Mensagem persistida e atualizada');
  });

  it('sends message and appends it to the cached thread', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        current_user_id: 10,
        messages: [],
      },
      error: null,
    });

    invokeMock.mockResolvedValueOnce({
      data: {
        message_id: 99,
      },
      error: null,
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.fetchMessages(20);
    });

    let sent = false;
    await act(async () => {
      sent = await result.current.sendMessage(20, '  mensagem enviada  ');
    });

    expect(sent).toBe(true);
    expect(invokeMock).toHaveBeenLastCalledWith('moodle-messaging', {
      body: {
        action: 'send_message',
        moodleUrl: 'https://moodle.example.com',
        token: 'token-123',
        moodle_user_id: 20,
        message: 'mensagem enviada',
      },
    });
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

  it('returns false when no session or when message text is blank', async () => {
    useMoodleSessionMock.mockReturnValue(null);

    const { result } = renderHook(() => useChat());

    let noSessionResult = true;
    await act(async () => {
      noSessionResult = await result.current.sendMessage(20, 'texto');
    });

    expect(noSessionResult).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();

    useMoodleSessionMock.mockReturnValue({
      moodleUrl: 'https://moodle.example.com',
      moodleToken: 'token-123',
    });

    const { result: resultWithSession } = renderHook(() => useChat());

    let blankResult = true;
    await act(async () => {
      blankResult = await resultWithSession.current.sendMessage(20, '   ');
    });

    expect(blankResult).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('sets conversation error when Moodle function invocation fails', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'request failed' },
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.fetchConversations();
    });

    await waitFor(() => {
      expect(result.current.conversationsError).toBe('request failed');
    });
  });
});
