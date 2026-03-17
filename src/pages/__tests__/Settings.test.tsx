import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Settings from "@/pages/Settings";

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const logoutMock = vi.fn();
const syncDataMock = vi.fn();

const selectMock = vi.fn();
const eqMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

const setAuthUser = () => {
  useAuthMock.mockReturnValue({
    user: {
      id: "u-1",
      full_name: "Julio Tutor",
      moodle_username: "julio",
      email: "julio@example.com",
    },
    logout: logoutMock,
    lastSync: "2026-02-20T12:00:00.000Z",
    syncData: syncDataMock,
    isSyncing: false,
    isOfflineMode: false,
    courses: [],
  });
};

describe("Settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    logoutMock.mockResolvedValue(undefined);
    setAuthUser();

    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    eqMock.mockReturnValue({ maybeSingle: maybeSingleMock });
    selectMock.mockReturnValue({ eq: eqMock });
    fromMock.mockImplementation(() => ({
      select: selectMock,
    }));
  });

  it("shows profile, theme and sync for all users", async () => {
    render(<Settings />);

    expect(
      screen.getByRole("heading", { level: 1, name: /configuracoes/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Julio Tutor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sincronizacao geral inicial/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sair da conta/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(fromMock).toHaveBeenCalledWith("app_settings");
    });
  });

  it("triggers initial general sync", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    await user.click(screen.getByRole("button", { name: /sincronizacao geral inicial/i }));
    expect(syncDataMock).toHaveBeenCalledTimes(1);
  });

  it("allows logout", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    await user.click(screen.getByRole("button", { name: /sair da conta/i }));
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});
