import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";

const useAuthMock = vi.fn();
const syncDataMock = vi.fn();
const setIsEditModeMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Open Sidebar</button>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe("TopBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      syncData: syncDataMock,
      lastSync: null,
      isSyncing: false,
      isEditMode: false,
      setIsEditMode: setIsEditModeMock,
      isOfflineMode: false,
    });
  });

  it("shows sync controls and triggers sync action", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TopBar />
      </MemoryRouter>,
    );

    expect(screen.getByText(/nunca/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sincronizar/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /abrir claris ia expandida/i }).getAttribute("href")).toMatch(/^\/claris\?context=/);

    await user.click(screen.getByRole("button", { name: /sincronizar/i }));
    expect(syncDataMock).toHaveBeenCalledTimes(1);
  });

  it("toggles edit mode via switch", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TopBar />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("switch"));

    expect(setIsEditModeMock).toHaveBeenCalledWith(true);
  });

  it("shows offline banner and hides sync button in offline mode", () => {
    useAuthMock.mockReturnValue({
      syncData: syncDataMock,
      lastSync: "2026-02-20T12:00:00.000Z",
      isSyncing: false,
      isEditMode: true,
      setIsEditMode: setIsEditModeMock,
      isOfflineMode: true,
    });

    render(
      <MemoryRouter>
        <TopBar />
      </MemoryRouter>,
    );

    expect(screen.getByText(/modo offline/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sincronizar/i })).not.toBeInTheDocument();
  });
});
