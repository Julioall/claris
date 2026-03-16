import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Settings from "@/pages/Settings";

const ADMIN_MOODLE_USERNAME = "04112637225";
const ADMIN_EMAIL = "julioalves@fieg.com.br";

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const toastMock = vi.fn();
const logoutMock = vi.fn();
const syncDataMock = vi.fn();

const selectMock = vi.fn();
const eqMock = vi.fn();
const maybeSingleMock = vi.fn();
const upsertMock = vi.fn();
const invokeMock = vi.fn();
const getUserMock = vi.fn();
const signOutMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
    auth: {
      getUser: (...args: unknown[]) => getUserMock(...args),
      signOut: (...args: unknown[]) => signOutMock(...args),
    },
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

vi.mock("@/components/settings/DataCleanupCard", () => ({
  DataCleanupCard: () => <div data-testid="data-cleanup-card" />,
}));

const setAuthUser = (overrides?: { moodle_username?: string; email?: string }) => {
  useAuthMock.mockReturnValue({
    user: {
      id: "u-1",
      full_name: "Julio Tutor",
      moodle_username: overrides?.moodle_username ?? "julio",
      email: overrides?.email ?? "julio@example.com",
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
    upsertMock.mockResolvedValue({ error: null });
    invokeMock.mockResolvedValue({ data: { latencyMs: 123 }, error: null });
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    signOutMock.mockResolvedValue({ error: null });
    eqMock.mockReturnValue({ maybeSingle: maybeSingleMock });
    selectMock.mockReturnValue({ eq: eqMock });
    fromMock.mockImplementation(() => ({
      select: selectMock,
      upsert: upsertMock,
    }));
  });

  it("shows only profile/theme/sync for common users", async () => {
    render(<Settings />);

    expect(
      screen.getByRole("heading", { level: 1, name: /configuracoes/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Julio Tutor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sincronizacao geral inicial/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /claris ia/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /salvar configuracoes/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("data-cleanup-card")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fromMock).toHaveBeenCalledWith("app_settings");
    });
  });

  it("shows admin cards for configured admin user", async () => {
    setAuthUser({ moodle_username: ADMIN_MOODLE_USERNAME, email: ADMIN_EMAIL });
    render(<Settings />);

    await waitFor(() => {
      expect(fromMock).toHaveBeenCalledWith("app_settings");
    });

    expect(screen.getByRole("heading", { name: /conexao moodle/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /salvar conexao moodle/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /claris ia/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /testar conexao/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /salvar claris ia/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sincronizacao geral inicial/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /salvar configuracoes/i })).toBeInTheDocument();
    expect(screen.getByTestId("data-cleanup-card")).toBeInTheDocument();
  });

  it("validates risk thresholds before saving", async () => {
    setAuthUser({ moodle_username: ADMIN_MOODLE_USERNAME, email: ADMIN_EMAIL });
    const user = userEvent.setup();
    render(<Settings />);

    const saveButton = screen.getByRole("button", { name: /salvar configuracoes/i });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });

    const numericInputs = screen.getAllByRole("spinbutton");
    const atencaoInput = numericInputs[0];
    const riscoInput = numericInputs[1];

    await user.clear(atencaoInput);
    await user.type(atencaoInput, "20");
    await user.clear(riscoInput);
    await user.type(riscoInput, "10");
    await user.click(screen.getByRole("button", { name: /salvar configuracoes/i }));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/invalidos/i),
        variant: "destructive",
      }),
    );
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("saves sync settings and allows logout", async () => {
    setAuthUser({ moodle_username: ADMIN_MOODLE_USERNAME, email: ADMIN_EMAIL });
    const user = userEvent.setup();
    render(<Settings />);

    const saveButton = screen.getByRole("button", { name: /salvar configuracoes/i });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });

    await user.click(saveButton);

    await waitFor(() => {
      expect(upsertMock).toHaveBeenCalledTimes(1);
    });
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/configuracoes salvas/i),
      }),
    );

    await user.click(screen.getByRole("button", { name: /sair da conta/i }));
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it("triggers initial general sync from settings for any user", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    await user.click(screen.getByRole("button", { name: /sincronizacao geral inicial/i }));
    expect(syncDataMock).toHaveBeenCalledTimes(1);
  });

  it("validates claris connection test input", async () => {
    setAuthUser({ moodle_username: ADMIN_MOODLE_USERNAME, email: ADMIN_EMAIL });
    const user = userEvent.setup();
    render(<Settings />);

    await user.click(screen.getByRole("button", { name: /testar conexao/i }));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/dados incompletos/i),
        variant: "destructive",
      }),
    );
  });

  it("tests claris connection through edge function proxy", async () => {
    setAuthUser({ moodle_username: ADMIN_MOODLE_USERNAME, email: ADMIN_EMAIL });
    const user = userEvent.setup();
    render(<Settings />);

    await user.type(screen.getByLabelText(/modelo/i), "gpt-4o-mini");
    await user.type(screen.getByLabelText(/chave api/i), "sk-test");

    await user.click(screen.getByRole("button", { name: /testar conexao/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("claris-llm-test", expect.objectContaining({
        body: expect.objectContaining({
          provider: "openai",
          model: "gpt-4o-mini",
        }),
      }));
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/conexao validada/i),
      }),
    );
  });
});
