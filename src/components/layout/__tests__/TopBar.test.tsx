import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TopBar } from "@/components/layout/TopBar";
import { BackgroundActivityProvider } from "@/contexts/BackgroundActivityContext";

const ROUTER_FUTURE = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const useAuthMock = vi.fn();
const setIsEditModeMock = vi.fn();
const fetchActivityFeedMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isAdmin: false, role: null, permissions: [], canAccessAdminSection: () => false }),
}));

vi.mock("@/features/auth/api/activity-feed.repository", () => ({
  fetchActivityFeed: (...args: unknown[]) => fetchActivityFeedMock(...args),
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Open Sidebar</button>,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange }: { checked?: boolean; onCheckedChange?: (value: boolean) => void }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked ? "true" : "false"}
      onClick={() => onCheckedChange?.(!checked)}
    >
      Toggle
    </button>
  ),
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/support/SupportButton", () => ({
  SupportButton: () => <button type="button">Suporte</button>,
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BackgroundActivityProvider>
        <MemoryRouter future={ROUTER_FUTURE}>{children}</MemoryRouter>
      </BackgroundActivityProvider>
    </QueryClientProvider>
  );
}

describe("TopBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchActivityFeedMock.mockResolvedValue([]);

    useAuthMock.mockReturnValue({
      user: { id: "u-1", full_name: "Julio" },
      lastSync: null,
      isEditMode: false,
      setIsEditMode: setIsEditModeMock,
      isOfflineMode: false,
    });
  });

  it("shows last sync info and loads notifications", async () => {
    render(<TopBar />, { wrapper: createWrapper() });

    expect(screen.getByText(/nunca/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchActivityFeedMock).toHaveBeenCalledTimes(1);
    });
  });

  it("toggles edit mode via switch", async () => {
    const user = userEvent.setup();
    render(<TopBar />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("switch"));

    expect(setIsEditModeMock).toHaveBeenCalledWith(true);
  });

  it("shows offline banner and hides sync button in offline mode", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1", full_name: "Julio" },
      lastSync: "2026-02-20T12:00:00.000Z",
      isEditMode: true,
      setIsEditMode: setIsEditModeMock,
      isOfflineMode: true,
    });

    render(<TopBar />, { wrapper: createWrapper() });

    expect(screen.getByText(/modo offline/i)).toBeInTheDocument();
  });

  it("opens notifications popover and shows unread badge", async () => {
    const user = userEvent.setup();

    fetchActivityFeedMock.mockResolvedValue([
      {
        id: "n-1",
        title: "Alerta Claris",
        description: "Há alunos em risco crítico.",
        event_type: "claris_notification",
        created_at: "2026-03-15T10:00:00.000Z",
        metadata: { severity: "critical" },
      },
    ]);

    render(<TopBar />, { wrapper: createWrapper() });

    const notificationButton = screen.getByRole("button", { name: /notificações/i });
    expect(notificationButton).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    await user.click(notificationButton);

    expect(await screen.findByText(/notificações/i)).toBeInTheDocument();
    expect(screen.getByText(/alerta claris/i)).toBeInTheDocument();
    expect(screen.getByText(/há alunos em risco crítico/i)).toBeInTheDocument();
  });
});
