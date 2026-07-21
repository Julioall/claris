import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MyServicesPage from "@/features/services/pages/MyServicesPage";
import { BackgroundActivityProvider } from "@/contexts/BackgroundActivityContext";

const useAuthMock = vi.fn();
const serviceApiMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  create: vi.fn(),
  deactivate: vi.fn(),
  delete: vi.fn(),
  getOverview: vi.fn(),
  getQrCode: vi.fn(),
  syncStatus: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/features/services/api/myServices", () => ({
  connectServiceInstance: serviceApiMocks.connect,
  createPersonalWhatsAppInstance: serviceApiMocks.create,
  deactivateServiceInstance: serviceApiMocks.deactivate,
  deleteServiceInstance: serviceApiMocks.delete,
  getMyServiceOverview: serviceApiMocks.getOverview,
  getServiceInstanceQrCode: serviceApiMocks.getQrCode,
  syncServiceInstanceStatus: serviceApiMocks.syncStatus,
  updateServiceInstance: serviceApiMocks.update,
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
  return render(
    <QueryClientProvider client={qc}>
      <BackgroundActivityProvider>{ui}</BackgroundActivityProvider>
    </QueryClientProvider>,
  );
}

function setupNoInstance() {
  serviceApiMocks.getOverview.mockResolvedValue({
    contractVersion: 1,
    instance: null,
    events: [],
  });
}

function setupWithInstance() {
  const instance = {
    id: "inst-1",
    name: "WhatsApp Pessoal",
    description: null,
    serviceType: "whatsapp",
    scope: "personal",
    connectionStatus: "connected",
    operationalStatus: "connected",
    healthStatus: "healthy",
    isActive: true,
    isBlocked: false,
    evolutionInstanceName: "claris-user1",
    lastActivityAt: null,
    lastSyncAt: null,
    createdAt: new Date().toISOString(),
    phoneNumber: null,
  };

  serviceApiMocks.getOverview.mockResolvedValue({
    contractVersion: 1,
    instance,
    events: [],
  });
}

describe("MeusServicos page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthUser();
    serviceApiMocks.connect.mockResolvedValue({ contractVersion: 1, success: true });
    serviceApiMocks.create.mockResolvedValue({ contractVersion: 1 });
    serviceApiMocks.deactivate.mockResolvedValue({ contractVersion: 1, success: true });
    serviceApiMocks.delete.mockResolvedValue({ contractVersion: 1, success: true });
    serviceApiMocks.getQrCode.mockResolvedValue({
      contractVersion: 1,
      qrCode: null,
      pairingCode: null,
      pending: true,
      message: "Aguardando QR Code",
    });
    serviceApiMocks.syncStatus.mockResolvedValue({
      contractVersion: 1,
      connectionStatus: "connected",
      healthStatus: "healthy",
    });
    serviceApiMocks.update.mockResolvedValue({ contractVersion: 1 });
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
