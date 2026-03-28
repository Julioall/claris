import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import App from "@/App";
import { APP_PERMISSIONS } from "@/lib/access-control";

const useAuthMock = vi.fn();
const usePermissionsMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => useAuthMock(),
}));

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => usePermissionsMock(),
}));

vi.mock("@/components/ui/toaster", () => ({
  Toaster: () => <div data-testid="toaster" />,
}));

vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => <div data-testid="sonner-toaster" />,
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/layout/AppLayout", async () => {
  const { Outlet } = await import("react-router-dom");
  return {
    AppLayout: () => (
      <div>
        <span>App Layout</span>
        <Outlet />
      </div>
    ),
  };
});

vi.mock("@/pages/Login", () => ({
  default: () => <div>Login Page</div>,
}));

vi.mock("@/features/dashboard/pages/DashboardPage", () => ({
  default: () => <div>Dashboard Page</div>,
}));

vi.mock("@/features/courses/pages/MyCoursesPage", () => ({
  default: () => <div>MyCourses Page</div>,
}));

vi.mock("@/features/courses/pages/SchoolsPage", () => ({
  default: () => <div>Schools Page</div>,
}));

vi.mock("@/features/courses/pages/CoursePanelPage", () => ({
  default: () => <div>CoursePanel Page</div>,
}));

vi.mock("@/features/students/pages/StudentsPage", () => ({
  default: () => <div>Students Page</div>,
}));

vi.mock("@/features/students/pages/StudentProfilePage", () => ({
  default: () => <div>StudentProfile Page</div>,
}));

vi.mock("@/features/tasks/pages/TasksPage", () => ({
  default: () => <div>Tarefas Page</div>,
}));

vi.mock("@/features/agenda/pages/AgendaPage", () => ({
  default: () => <div>Agenda Page</div>,
}));

vi.mock("@/features/messages/pages/MessagesPage", () => ({
  default: () => <div>Messages Page</div>,
}));

vi.mock("@/features/whatsapp/pages/WhatsAppPage", () => ({
  default: () => <div>WhatsApp Page</div>,
}));

vi.mock("@/features/campaigns/pages/CampaignsPage", () => ({
  default: () => <div>Campaigns Page</div>,
}));

vi.mock("@/features/settings/pages/SettingsPage", () => ({
  default: () => <div>Settings Page</div>,
}));

vi.mock("@/features/reports/pages/ReportsPage", () => ({
  default: () => <div>Reports Page</div>,
}));

vi.mock("@/features/claris/pages/ClarisPage", () => ({
  default: () => <div>Claris Page</div>,
}));

vi.mock("@/pages/NotFound", () => ({
  default: () => <div>NotFound Page</div>,
}));

vi.mock("@/features/automations/pages/AutomacoesPage", () => ({
  default: () => <div>Automacoes Page</div>,
}));

vi.mock("@/features/services/pages/MyServicesPage", () => ({
  default: () => <div>MeusServicos Page</div>,
}));

vi.mock("@/features/admin/pages/AdminServicosAplicacao", () => ({
  default: () => <div>AdminServicosAplicacao Page</div>,
}));

function setPath(path: string) {
  window.history.pushState({}, "Test", path);
}

describe("App routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });
    usePermissionsMock.mockReturnValue({
      isAdmin: false,
      isLoading: false,
      isFetching: false,
      role: "tutor",
      group: { id: "group-1", name: "Tutor", slug: "tutor" },
      permissions: Object.values(APP_PERMISSIONS),
      refresh: vi.fn(),
      can: () => true,
      canAny: () => true,
      canAccessAdminSection: () => false,
    });
  });

  it("shows loading state while auth is loading", () => {
    setPath("/");
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    const { container } = render(<App />);

    expect(container.querySelector('[data-testid="spinner"]')).toBeInTheDocument();
  });

  it("redirects unauthenticated users to login page", async () => {
    setPath("/");
    render(<App />);

    expect(await screen.findByText("Login Page")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard Page")).not.toBeInTheDocument();
  });

  it("redirects authenticated users away from login to dashboard", async () => {
    setPath("/login");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(await screen.findByText("Dashboard Page")).toBeInTheDocument();
    expect(screen.getByText("App Layout")).toBeInTheDocument();
  });

  it("renders a protected nested route for authenticated users", async () => {
    setPath("/mensagens");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(await screen.findByText("Messages Page")).toBeInTheDocument();
    expect(screen.getByText("App Layout")).toBeInTheDocument();
  });

  it("renders whatsapp page for authenticated users", async () => {
    setPath("/whatsapp");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(await screen.findByText("WhatsApp Page")).toBeInTheDocument();
    expect(screen.getByText("App Layout")).toBeInTheDocument();
  });

  it("renders reports page for authenticated users", async () => {
    setPath("/relatorios");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(await screen.findByText("Reports Page")).toBeInTheDocument();
    expect(screen.getByText("App Layout")).toBeInTheDocument();
  });

  it("renders campaigns page for authenticated users", async () => {
    setPath("/campanhas");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(await screen.findByText("Campaigns Page")).toBeInTheDocument();
    expect(screen.getByText("App Layout")).toBeInTheDocument();
  });

  it("renders claris page for authenticated users", async () => {
    setPath("/claris");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(await screen.findByText("Claris Page")).toBeInTheDocument();
    expect(screen.getByText("App Layout")).toBeInTheDocument();
  });

  it("renders tarefas page for authenticated users", async () => {
    setPath("/tarefas");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(await screen.findByText("Tarefas Page")).toBeInTheDocument();
    expect(screen.getByText("App Layout")).toBeInTheDocument();
  });

  it("renders agenda page for authenticated users", async () => {
    setPath("/agenda");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(await screen.findByText("Agenda Page")).toBeInTheDocument();
    expect(screen.getByText("App Layout")).toBeInTheDocument();
  });

  it("renders not found page for unknown route", async () => {
    setPath("/rota-inexistente");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(await screen.findByText("NotFound Page")).toBeInTheDocument();
  });

  it("renders meus-servicos page for authenticated users", async () => {
    setPath("/meus-servicos");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(await screen.findByText("MeusServicos Page")).toBeInTheDocument();
    expect(screen.getByText("App Layout")).toBeInTheDocument();
  });

  it("renders automacoes page for authenticated users", async () => {
    setPath("/automacoes");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(await screen.findByText("Automacoes Page")).toBeInTheDocument();
    expect(screen.getByText("App Layout")).toBeInTheDocument();
  });
});
