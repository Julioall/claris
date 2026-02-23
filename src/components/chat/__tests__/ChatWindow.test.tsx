import { forwardRef, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatWindow } from "@/components/chat/ChatWindow";

const useChatMock = vi.fn();
const fetchMessagesMock = vi.fn();
const sendMessageMock = vi.fn();

vi.mock("@/hooks/useChat", () => ({
  useChat: () => useChatMock(),
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: forwardRef<HTMLDivElement, { children: ReactNode }>(
    ({ children }, ref) => (
      <div ref={ref}>
        <div data-radix-scroll-area-viewport>{children}</div>
      </div>
    ),
  ),
}));

describe("ChatWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatMock.mockReturnValue({
      messages: [
        {
          id: "m-1",
          senderType: "tutor",
          text: "<p>Olá aluno</p>",
          timecreated: Math.floor(Date.now() / 1000),
        },
      ],
      isLoading: false,
      isSending: false,
      error: "",
      fetchMessages: fetchMessagesMock,
      sendMessage: sendMessageMock,
    });
    fetchMessagesMock.mockResolvedValue(undefined);
    sendMessageMock.mockResolvedValue(undefined);
  });

  it("fetches messages on mount and shows chat header", async () => {
    render(<ChatWindow moodleUserId={123} studentName="Ana Silva" />);

    expect(screen.getByText(/chat com ana silva/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMessagesMock).toHaveBeenCalledWith(123);
    });
  });

  it("renders loading and error states", () => {
    useChatMock.mockReturnValue({
      messages: [],
      isLoading: true,
      isSending: false,
      error: "",
      fetchMessages: fetchMessagesMock,
      sendMessage: sendMessageMock,
    });
    const { rerender, container } = render(
      <ChatWindow moodleUserId={123} studentName="Ana Silva" />,
    );

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    useChatMock.mockReturnValue({
      messages: [],
      isLoading: false,
      isSending: false,
      error: "Falha no chat",
      fetchMessages: fetchMessagesMock,
      sendMessage: sendMessageMock,
    });
    rerender(<ChatWindow moodleUserId={123} studentName="Ana Silva" />);

    expect(screen.getByText(/falha no chat/i)).toBeInTheDocument();
  });

  it("renders empty-state message list", () => {
    useChatMock.mockReturnValue({
      messages: [],
      isLoading: false,
      isSending: false,
      error: "",
      fetchMessages: fetchMessagesMock,
      sendMessage: sendMessageMock,
    });
    render(<ChatWindow moodleUserId={123} studentName="Ana Silva" />);

    expect(screen.getByText(/nenhuma mensagem ainda/i)).toBeInTheDocument();
  });

  it("sends a message and clears input", async () => {
    const user = userEvent.setup();
    render(<ChatWindow moodleUserId={123} studentName="Ana Silva" />);

    const input = screen.getByPlaceholderText(/digite sua mensagem/i);
    await user.type(input, "Teste de envio");
    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(123, "Teste de envio");
    });
    expect(input).toHaveValue("");
  });
});
