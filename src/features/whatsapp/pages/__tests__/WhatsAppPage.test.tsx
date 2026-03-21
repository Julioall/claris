import { forwardRef, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WhatsAppPage from "@/features/whatsapp/pages/WhatsAppPage";

const fromMock = vi.fn();
const invokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: forwardRef<HTMLDivElement, { children: ReactNode; className?: string }>(
    ({ children, className }, ref) => (
      <div ref={ref} className={className}>
        <div data-radix-scroll-area-viewport>{children}</div>
      </div>
    ),
  ),
}));

const connectedInstance = {
  id: "inst-1",
  name: "WhatsApp Pessoal",
  scope: "personal" as const,
  connection_status: "connected",
  is_active: true,
  is_blocked: false,
  last_activity_at: "2026-03-19T12:00:00.000Z",
  created_at: "2026-03-19T08:00:00.000Z",
  metadata: { phone_number: "5562999990000" },
};

const conversations = [
  {
    id: "5511999991111@s.whatsapp.net",
    remote_jid: "5511999991111@s.whatsapp.net",
    name: "Ana Silva",
    phone: "+5511999991111",
    unread_count: 2,
    last_message_text: "Bom dia, professora!",
    last_message_at: "2026-03-19T12:00:00.000Z",
    is_group: false,
  },
  {
    id: "5511999992222@s.whatsapp.net",
    remote_jid: "5511999992222@s.whatsapp.net",
    name: "Bruno Souza",
    phone: "+5511999992222",
    unread_count: 0,
    last_message_text: "Posso te responder depois do almoço?",
    last_message_at: "2026-03-19T11:40:00.000Z",
    is_group: false,
  },
];

const messagesByConversation: Record<string, Array<Record<string, unknown>>> = {
  "5511999991111@s.whatsapp.net": [
    {
      id: "msg-1",
      remote_jid: "5511999991111@s.whatsapp.net",
      text: "Bom dia, professora!",
      sent_at: "2026-03-19T11:58:00.000Z",
      direction: "incoming",
    },
    {
      id: "msg-2",
      remote_jid: "5511999991111@s.whatsapp.net",
      text: "Oi, Ana. Como posso ajudar?",
      sent_at: "2026-03-19T11:59:00.000Z",
      direction: "outgoing",
      status: "read",
    },
  ],
  "5511999992222@s.whatsapp.net": [
    {
      id: "msg-3",
      remote_jid: "5511999992222@s.whatsapp.net",
      text: "Posso te responder depois do almoço?",
      sent_at: "2026-03-19T11:40:00.000Z",
      direction: "incoming",
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WhatsAppPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockInstances(instances: unknown[]) {
  fromMock.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: instances,
            error: null,
          }),
        }),
      }),
    }),
  });
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

describe("WhatsApp page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "Test", "/whatsapp");
    setViewportWidth(1280);
  });

  it("renders an empty state when no WhatsApp instance is available", async () => {
    mockInstances([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/nenhuma instância disponível/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: /abrir meus serviços/i })).toHaveAttribute(
      "href",
      "/meus-servicos",
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("loads conversations and the first message history from the connected instance", async () => {
    mockInstances([connectedInstance]);
    invokeMock.mockImplementation((_fn: string, { body }: { body: Record<string, unknown> }) => {
      if (body.action === "get_chats") {
        return Promise.resolve({ data: { conversations }, error: null });
      }

      if (body.action === "get_messages") {
        return Promise.resolve({
          data: {
            messages: messagesByConversation[String(body.remote_jid)] ?? [],
          },
          error: null,
        });
      }

      return Promise.resolve({ data: {}, error: null });
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("Ana Silva").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText(/whatsapp pessoal/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/bom dia, professora!/i)).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith(
      "whatsapp-messaging",
      expect.objectContaining({
        body: expect.objectContaining({
          action: "get_chats",
          instance_id: "inst-1",
        }),
      }),
    );
  });

  it("filters conversations by the search field", async () => {
    const user = userEvent.setup();
    mockInstances([connectedInstance]);
    invokeMock.mockImplementation((_fn: string, { body }: { body: Record<string, unknown> }) => {
      if (body.action === "get_chats") {
        return Promise.resolve({ data: { conversations }, error: null });
      }

      if (body.action === "get_messages") {
        return Promise.resolve({
          data: {
            messages: messagesByConversation[String(body.remote_jid)] ?? [],
          },
          error: null,
        });
      }

      return Promise.resolve({ data: {}, error: null });
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /bruno souza/i })).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/buscar conversa/i), "bruno");

    expect(screen.getByRole("button", { name: /bruno souza/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ana silva/i })).not.toBeInTheDocument();
  });

  it("sends a message through the whatsapp-messaging function and appends it to the chat", async () => {
    const user = userEvent.setup();
    mockInstances([connectedInstance]);
    invokeMock.mockImplementation((_fn: string, { body }: { body: Record<string, unknown> }) => {
      if (body.action === "get_chats") {
        return Promise.resolve({ data: { conversations }, error: null });
      }

      if (body.action === "get_messages") {
        return Promise.resolve({
          data: {
            messages: messagesByConversation[String(body.remote_jid)] ?? [],
          },
          error: null,
        });
      }

      if (body.action === "send_message") {
        return Promise.resolve({
          data: {
            message: {
              id: "msg-4",
              remote_jid: body.remote_jid,
              text: body.message,
              sent_at: "2026-03-19T12:01:00.000Z",
              direction: "outgoing",
              status: "sent",
            },
          },
          error: null,
        });
      }

      return Promise.resolve({ data: {}, error: null });
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/oi, ana\. como posso ajudar\?/i)).toBeInTheDocument();
    });

    await user.type(
      screen.getByPlaceholderText(/digite uma mensagem no whatsapp/i),
      "Tudo bem, Ana?",
    );
    await user.click(screen.getByRole("button", { name: /enviar mensagem/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Tudo bem, Ana?").length).toBeGreaterThan(0);
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "whatsapp-messaging",
      expect.objectContaining({
        body: expect.objectContaining({
          action: "send_message",
          instance_id: "inst-1",
          remote_jid: "5511999991111@s.whatsapp.net",
          message: "Tudo bem, Ana?",
        }),
      }),
    );
  });

  it("uses a master-detail flow on mobile so the message area stays usable", async () => {
    const user = userEvent.setup();
    setViewportWidth(390);
    mockInstances([connectedInstance]);
    invokeMock.mockImplementation((_fn: string, { body }: { body: Record<string, unknown> }) => {
      if (body.action === "get_chats") {
        return Promise.resolve({ data: { conversations }, error: null });
      }

      if (body.action === "get_messages") {
        return Promise.resolve({
          data: {
            messages: messagesByConversation[String(body.remote_jid)] ?? [],
          },
          error: null,
        });
      }

      return Promise.resolve({ data: {}, error: null });
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ana silva/i })).toBeInTheDocument();
    });

    expect(screen.queryByPlaceholderText(/digite uma mensagem no whatsapp/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ana silva/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /voltar para conversas/i })).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText(/digite uma mensagem no whatsapp/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /voltar para conversas/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /bruno souza/i })).toBeInTheDocument();
    });

    expect(screen.queryByPlaceholderText(/digite uma mensagem no whatsapp/i)).not.toBeInTheDocument();
  });
});
