import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Settings from "@/pages/Settings";

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const toastMock = vi.fn();
const logoutMock = vi.fn();

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

vi.mock("@/components/settings/GradeDebugCard", () => ({
  GradeDebugCard: () => <div data-testid="grade-debug-card" />,
}));

describe("Settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    logoutMock.mockResolvedValue(undefined);
    useAuthMock.mockReturnValue({
      user: {
        id: "u-1",
        full_name: "Julio Tutor",
        moodle_username: "julio",
        email: "julio@example.com",
      },
      logout: logoutMock,
      lastSync: "2026-02-20T12:00:00.000Z",
    });

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

  it("renders profile information and settings cards", async () => {
    render(<Settings />);

    expect(
      screen.getByRole("heading", { level: 1, name: /configuracoes/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Julio Tutor")).toBeInTheDocument();
    expect(screen.getByTestId("data-cleanup-card")).toBeInTheDocument();
    expect(screen.getByTestId("grade-debug-card")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /claris ia/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /testar conexao/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /salvar claris ia/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(fromMock).toHaveBeenCalledWith("user_sync_preferences");
    });
  });

  it("validates risk thresholds before saving", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    const saveButton = screen.getByRole("button", { name: /salvar configuracoes/i });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });

    const numericInputs = screen.getAllByRole("spinbutton");
    await user.clear(numericInputs[4]);
    await user.type(numericInputs[4], "20");
    await user.clear(numericInputs[5]);
    await user.type(numericInputs[5], "10");
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

  it("validates claris connection test input", async () => {
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
