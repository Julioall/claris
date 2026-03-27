import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminConfiguracoes from "@/features/admin/pages/AdminConfiguracoes";
import type { ReactNode } from "react";

const fromMock = vi.fn();
const toastMock = vi.fn();

const selectMock = vi.fn();
const eqMock = vi.fn();
const maybeSingleMock = vi.fn();
const upsertMock = vi.fn();
const invokeMock = vi.fn();
const getUserMock = vi.fn();
const signOutMock = vi.fn();

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

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe("AdminConfiguracoes page", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    upsertMock.mockResolvedValue({ error: null });
    invokeMock.mockResolvedValue({ data: { latencyMs: 123 }, error: null });
    getUserMock.mockResolvedValue({ data: { user: { id: "u-1" } }, error: null });
    signOutMock.mockResolvedValue({ error: null });
    eqMock.mockReturnValue({ maybeSingle: maybeSingleMock });
    selectMock.mockReturnValue({ eq: eqMock });
    fromMock.mockImplementation(() => ({
      select: selectMock,
      upsert: upsertMock,
    }));
  });

  it("shows admin configuration cards", async () => {
    render(<AdminConfiguracoes />);

    await waitFor(() => {
      expect(fromMock).toHaveBeenCalledWith("app_settings");
    });

    expect(screen.getByRole("heading", { name: /conexao moodle/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /salvar conexao moodle/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /limiares de risco/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /salvar limiares de risco/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /claris ia/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /testar conexao/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /salvar claris ia/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^prompt de instrucoes personalizadas$/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /correcao com ia/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /salvar correcao com ia/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^prompt de instrucoes personalizadas do feedback$/i)).toBeInTheDocument();
  });

  it("validates risk thresholds before saving", async () => {
    const user = userEvent.setup();
    render(<AdminConfiguracoes />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /salvar limiares de risco/i })).toBeEnabled();
    });

    const numericInputs = screen.getAllByRole("spinbutton");
    const atencaoInput = numericInputs[0];
    const riscoInput = numericInputs[1];

    await user.clear(atencaoInput);
    await user.type(atencaoInput, "20");
    await user.clear(riscoInput);
    await user.type(riscoInput, "10");
    await user.click(screen.getByRole("button", { name: /salvar limiares de risco/i }));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/invalidos/i),
        variant: "destructive",
      }),
    );
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("saves risk threshold settings", async () => {
    const user = userEvent.setup();
    render(<AdminConfiguracoes />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /salvar limiares de risco/i })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: /salvar limiares de risco/i }));

    await waitFor(() => {
      expect(upsertMock).toHaveBeenCalledTimes(1);
    });
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/risco salvas/i),
      }),
    );
  });

  it("validates claris connection test input", async () => {
    const user = userEvent.setup();
    render(<AdminConfiguracoes />);

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
    render(<AdminConfiguracoes />);

    await user.type(screen.getByLabelText(/modelo/i), "gpt-4o-mini");
    await user.type(screen.getByLabelText(/chave api/i), "sk-test");

    await user.click(screen.getByRole("button", { name: /testar conexao/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "claris-llm-test",
        expect.objectContaining({
          body: expect.objectContaining({
            provider: "openai",
            model: "gpt-4o-mini",
          }),
        }),
      );
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/conexao validada/i),
      }),
    );
  });

  it("saves claris custom instructions together with connection settings", async () => {
    const user = userEvent.setup();
    render(<AdminConfiguracoes />);

    await user.type(screen.getByLabelText(/^modelo$/i), "gpt-4o-mini");
    await user.type(screen.getByLabelText(/chave api/i), "sk-test");
    await user.type(
      screen.getByLabelText(/^prompt de instrucoes personalizadas$/i),
      "Priorize proximos passos e responda de forma mais consultiva.",
    );

    await user.click(screen.getByRole("button", { name: /salvar claris ia/i }));

    await waitFor(() => {
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          singleton_id: "global",
          claris_llm_settings: expect.objectContaining({
            model: "gpt-4o-mini",
            customInstructions: "Priorize proximos passos e responda de forma mais consultiva.",
          }),
        }),
        expect.objectContaining({ onConflict: "singleton_id" }),
      );
    });
  });

  it("saves AI grading operational settings", async () => {
    const user = userEvent.setup();
    render(<AdminConfiguracoes />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /salvar correcao com ia/i })).toBeEnabled();
    });

    await user.clear(screen.getByLabelText(/^prompt de instrucoes personalizadas do feedback$/i));
    await user.type(
      screen.getByLabelText(/^prompt de instrucoes personalizadas do feedback$/i),
      "Comece pelos pontos fortes e use linguagem mais acolhedora.",
    );

    await user.click(screen.getByRole("button", { name: /salvar correcao com ia/i }));

    await waitFor(() => {
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          singleton_id: "global",
          ai_grading_settings: expect.objectContaining({
            enabled: true,
            timeoutMs: 45000,
            customInstructions: "Comece pelos pontos fortes e use linguagem mais acolhedora.",
          }),
        }),
        expect.objectContaining({ onConflict: "singleton_id" }),
      );
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/correcao com ia salva/i),
      }),
    );
  });
});
