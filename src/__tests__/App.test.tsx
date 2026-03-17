import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import App from "@/App";

const useAuthMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => useAuthMock(),
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

vi.mock("@/pages/Dashboard", () => ({
  default: () => <div>Dashboard Page</div>,
}));

vi.mock("@/pages/MyCourses", () => ({
  default: () => <div>MyCourses Page</div>,
}));

vi.mock("@/pages/Schools", () => ({
  default: () => <div>Schools Page</div>,
}));

vi.mock("@/pages/CoursePanel", () => ({
  default: () => <div>CoursePanel Page</div>,
}));

vi.mock("@/pages/Students", () => ({
  default: () => <div>Students Page</div>,
}));

vi.mock("@/pages/StudentProfile", () => ({
  default: () => <div>StudentProfile Page</div>,
}));

vi.mock("@/pages/Tarefas", () => ({
  default: () => <div>Tarefas Page</div>,
}));

vi.mock("@/pages/Agenda", () => ({
  default: () => <div>Agenda Page</div>,
}));

vi.mock("@/pages/Messages", () => ({
  default: () => <div>Messages Page</div>,
}));

vi.mock("@/pages/Settings", () => ({
  default: () => <div>Settings Page</div>,
}));

vi.mock("@/pages/Reports", () => ({
  default: () => <div>Reports Page</div>,
}));

vi.mock("@/pages/Claris", () => ({
  default: () => <div>Claris Page</div>,
}));

vi.mock("@/pages/NotFound", () => ({
  default: () => <div>NotFound Page</div>,
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

  it("redirects unauthenticated users to login page", () => {
    setPath("/");
    render(<App />);

    expect(screen.getByText("Login Page")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard Page")).not.toBeInTheDocument();
  });

  it("redirects authenticated users away from login to dashboard", () => {
    setPath("/login");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(screen.getByText("Dashboard Page")).toBeInTheDocument();
    expect(screen.getByText("App Layout")).toBeInTheDocument();
  });

  it("renders a protected nested route for authenticated users", () => {
    setPath("/mensagens");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(screen.getByText("Messages Page")).toBeInTheDocument();
    expect(screen.getByText("App Layout")).toBeInTheDocument();
  });

  it("renders reports page for authenticated users", () => {
    setPath("/relatorios");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(screen.getByText("Reports Page")).toBeInTheDocument();
    expect(screen.getByText("App Layout")).toBeInTheDocument();
  });

  it("renders claris page for authenticated users", () => {
    setPath("/claris");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(screen.getByText("Claris Page")).toBeInTheDocument();
    expect(screen.getByText("App Layout")).toBeInTheDocument();
  });

  it("renders tarefas page for authenticated users", () => {
    setPath("/tarefas");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(screen.getByText("Tarefas Page")).toBeInTheDocument();
    expect(screen.getByText("App Layout")).toBeInTheDocument();
  });

  it("renders agenda page for authenticated users", () => {
    setPath("/agenda");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(screen.getByText("Agenda Page")).toBeInTheDocument();
    expect(screen.getByText("App Layout")).toBeInTheDocument();
  });

  it("renders not found page for unknown route", () => {
    setPath("/rota-inexistente");
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(<App />);

    expect(screen.getByText("NotFound Page")).toBeInTheDocument();
  });
});
