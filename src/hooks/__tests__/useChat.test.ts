import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useChat } from "@/hooks/useChat";

const useAuthMock = vi.fn();
const invokeMock = vi.fn();
const fromMock = vi.fn();
const selectStudentsMock = vi.fn();
const inStudentsMock = vi.fn();
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

function setupStudentsChain() {
  selectStudentsMock.mockReturnValue({ in: inStudentsMock });
  fromMock.mockImplementation((table: string) => {
    if (table === "students") {
      return {
        select: selectStudentsMock,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("useChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({
      moodleSession: {
        moodleUrl: "https://moodle.example.com",
        moodleToken: "token-123",
      },
    });

    setupStudentsChain();
    inStudentsMock.mockResolvedValue({ data: [], error: null });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("fetches conversations and maps Moodle users to student ids", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        current_user_id: 10,
        conversations: [
          {
            id: 7,
            members: [
              { id: 10, fullname: "Tutor" },
              { id: 20, fullname: "Ana Silva" },
            ],
            messages: [{ text: "Oi", timecreated: 1700 }],
            unreadcount: 2,
          },
        ],
      },
      error: null,
    });

    inStudentsMock.mockResolvedValueOnce({
      data: [{ id: "student-1", moodle_user_id: "20" }],
      error: null,
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.fetchConversations();
    });

    expect(invokeMock).toHaveBeenCalledWith("moodle-messaging", {
      body: {
        action: "get_conversations",
        moodleUrl: "https://moodle.example.com",
        token: "token-123",
      },
    });
    expect(result.current.currentMoodleUserId).toBe(10);
    expect(result.current.conversations).toEqual([
      {
        id: 7,
        member: { id: 20, fullname: "Ana Silva" },
        lastMessage: { text: "Oi", timecreated: 1700 },
        unreadcount: 2,
        studentId: "student-1",
      },
    ]);
  });

  it("fetches and sorts messages with sender type", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        current_user_id: 10,
        messages: [
          { id: 2, text: "Mensagem 2", timecreated: 200, useridfrom: 10 },
          { id: 1, text: "Mensagem 1", timecreated: 100, useridfrom: 20 },
        ],
      },
      error: null,
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.fetchMessages(20, 10);
    });

    expect(invokeMock).toHaveBeenCalledWith("moodle-messaging", {
      body: {
        action: "get_messages",
        moodleUrl: "https://moodle.example.com",
        token: "token-123",
        moodle_user_id: 20,
        limit_num: 10,
      },
    });
    expect(result.current.messages).toEqual([
      {
        id: "1",
        text: "Mensagem 1",
        timecreated: 100,
        useridfrom: 20,
        senderType: "student",
      },
      {
        id: "2",
        text: "Mensagem 2",
        timecreated: 200,
        useridfrom: 10,
        senderType: "tutor",
      },
    ]);
  });

  it("sends message and appends optimistic item", async () => {
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

    let ok = false;
    await act(async () => {
      ok = await result.current.sendMessage(20, "  mensagem enviada  ");
    });

    expect(ok).toBe(true);
    expect(invokeMock).toHaveBeenLastCalledWith("moodle-messaging", {
      body: {
        action: "send_message",
        moodleUrl: "https://moodle.example.com",
        token: "token-123",
        moodle_user_id: 20,
        message: "mensagem enviada",
      },
    });
    expect(result.current.messages.at(-1)).toMatchObject({
      id: "99",
      text: "mensagem enviada",
      useridfrom: 10,
      senderType: "tutor",
    });
  });

  it("returns false when no session or when message text is blank", async () => {
    useAuthMock.mockReturnValue({ moodleSession: null });

    const { result } = renderHook(() => useChat());

    let noSessionResult = true;
    await act(async () => {
      noSessionResult = await result.current.sendMessage(20, "texto");
    });

    expect(noSessionResult).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();

    useAuthMock.mockReturnValue({
      moodleSession: {
        moodleUrl: "https://moodle.example.com",
        moodleToken: "token-123",
      },
    });

    const { result: resultWithSession } = renderHook(() => useChat());

    let blankResult = true;
    await act(async () => {
      blankResult = await resultWithSession.current.sendMessage(20, "   ");
    });

    expect(blankResult).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("sets error when Moodle function invocation fails", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: "request failed" },
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.fetchConversations();
    });

    await waitFor(() => {
      expect(result.current.error).toBe("request failed");
    });
  });
});
