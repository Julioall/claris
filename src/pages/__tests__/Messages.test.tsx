import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import Messages from "@/pages/Messages";

const useChatMock = vi.fn();
const fetchConversationsMock = vi.fn();

vi.mock("@/hooks/useChat", () => ({
  useChat: () => useChatMock(),
}));

vi.mock("@/components/chat/ChatWindow", () => ({
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

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <Messages />
    </MemoryRouter>,
  );
}

describe("Messages page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchConversationsMock.mockResolvedValue(undefined);
    useChatMock.mockReturnValue({
      conversations: [
        {
          id: 1,
          member: { id: 11, fullname: "Ana Silva" },
          unreadcount: 2,
          studentId: "s-1",
          lastMessage: {
            text: "<p>Mensagem recente da Ana</p>",
            timecreated: Math.floor(Date.now() / 1000),
          },
        },
        {
          id: 2,
          member: { id: 22, fullname: "Bruno Souza" },
          unreadcount: 0,
          studentId: null,
          lastMessage: null,
        },
      ],
      isLoading: false,
      error: "",
      fetchConversations: fetchConversationsMock,
    });
  });

  it("fetches conversations on mount", async () => {
    renderPage();

    await waitFor(() => {
      expect(fetchConversationsMock).toHaveBeenCalledTimes(1);
    });
  });

  it("renders error banner when hook returns an error", () => {
    useChatMock.mockReturnValue({
      conversations: [],
      isLoading: false,
      error: "Falha ao buscar",
      fetchConversations: fetchConversationsMock,
    });

    renderPage();

    expect(screen.getByText(/erro ao carregar conversas/i)).toBeInTheDocument();
    expect(screen.getByText(/falha ao buscar/i)).toBeInTheDocument();
  });

  it("filters conversations by search query", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText("Bruno Souza")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/buscar conversa/i), "ana");

    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.queryByText("Bruno Souza")).not.toBeInTheDocument();
  });

  it("opens chat window after selecting a conversation", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /ana silva/i }));

    expect(screen.getByTestId("chat-window")).toHaveTextContent("Ana Silva:11");
    expect(screen.getByRole("link", { name: /ver perfil do aluno/i })).toHaveAttribute(
      "href",
      "/alunos/s-1",
    );
  });
});
