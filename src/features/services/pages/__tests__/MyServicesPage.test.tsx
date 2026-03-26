import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MyServicesPage from "@/features/services/pages/MyServicesPage";

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    auth: {
      getSession: () => getSessionMock(),
    },
  },
}));

const mockUser = {
  id: "user-1",
  full_name: "Tutor Teste",
  moodle_username: "tutor",
  email: "tutor@example.com",
};

function setAuthUser() {
  useAuthMock.mockReturnValue({ user: mockUser });
}

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function setupNoInstance() {
  fromMock.mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    }),
  }));
}

function setupWithInstance() {
  const instance = {
    id: "inst-1",
    name: "WhatsApp Pessoal",
    description: null,
    service_type: "whatsapp",
    scope: "personal",
    connection_status: "connected",
    operational_status: "connected",
    health_status: "healthy",
    is_active: true,
    is_blocked: false,
    evolution_instance_name: "claris-user1",
    last_activity_at: null,
    last_sync_at: null,
    created_at: new Date().toISOString(),
    owner_user_id: "user-1",
  };

  fromMock.mockImplementation((table: string) => {
    if (table === "app_service_instances") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: instance, error: null }),
              }),
            }),
          }),
        }),
      };
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    };
  });
}

describe("MeusServicos page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthUser();
    getSessionMock.mockResolvedValue({ data: { session: null } });
  });

  it("renders the page title", async () => {
    setupNoInstance();
    renderWithClient(<MyServicesPage />);
    await waitFor(() => {
      expect(screen.getByText(/meus servi/i)).toBeInTheDocument();
    });
  });

  it("shows create button when no instance exists", async () => {
    setupNoInstance();
    renderWithClient(<MyServicesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /criar minha inst/i })).toBeInTheDocument();
    });
  });

  it("shows instance details when instance exists", async () => {
    setupWithInstance();
    renderWithClient(<MyServicesPage />);

    await waitFor(() => {
      expect(screen.getByText("WhatsApp Pessoal")).toBeInTheDocument();
    });
  });

  it("shows disconnect action when the instance is already connected", async () => {
    setupWithInstance();
    renderWithClient(<MyServicesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /desconectar/i })).toBeInTheDocument();
    });
  });

  it("shows future services placeholder", async () => {
    setupNoInstance();
    renderWithClient(<MyServicesPage />);

    await waitFor(() => {
      expect(screen.getByText(/microsoft/i)).toBeInTheDocument();
    });
  });
});
