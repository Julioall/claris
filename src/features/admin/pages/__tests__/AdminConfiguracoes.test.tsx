import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminConfiguracoes from "@/features/admin/pages/AdminConfiguracoes";
import { DEFAULT_AI_GRADING_SETTINGS } from "@/lib/ai-grading-settings";
import type { ReactNode } from "react";

const toastMock = vi.fn();
const useAuthMock = vi.fn();
const edgeInvokeMock = vi.fn();
const cleanupInvokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => cleanupInvokeMock(...args),
    },
  },
}));

vi.mock("@/integrations/http/edge-function-client", () => ({
  invokeEdgeFunction: (...args: unknown[]) => edgeInvokeMock(...args),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe("AdminConfiguracoes page", () => {
  const adminSettingsResponse = {
    contractVersion: 1,
    publicSettings: {
      contractVersion: 1,
    },
    riskThresholdDays: { atencao: 7, risco: 14, critico: 30 },
    clarisSettings: {
      provider: "openai",
      model: "",
      baseUrl: "https://api.openai.com/v1",
      customInstructions: "",
      configured: false,
      apiKeyConfigured: false,
      updatedAt: null,
    },
    aiGradingSettings: DEFAULT_AI_GRADING_SETTINGS,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({
      setCourses: vi.fn(),
    });
    edgeInvokeMock.mockImplementation(async (functionName: string, options: { body?: Record<string, unknown> }) => {
      if (functionName === "claris-llm-test") {
        return { contractVersion: 1, latencyMs: 123 };
      }

      const body = options.body ?? {};
      if (body.action === "update_risk_thresholds") {
        return { ...adminSettingsResponse, riskThresholdDays: body.riskThresholdDays };
      }
      if (body.action === "update_claris") {
        const settings = body.settings as Record<string, unknown>;
        const { apiKey, ...publicSettings } = settings;
        return {
          ...adminSettingsResponse,
          clarisSettings: {
            ...adminSettingsResponse.clarisSettings,
            ...publicSettings,
            apiKeyConfigured: Boolean(apiKey),
            configured: Boolean(settings.model && settings.baseUrl && apiKey),
            updatedAt: "2026-07-21T13:00:00.000Z",
          },
        };
      }
      if (body.action === "update_ai_grading") {
        return { ...adminSettingsResponse, aiGradingSettings: body.settings };
      }
      return adminSettingsResponse;
    });
  });

  it("shows admin configuration cards", async () => {
    render(<AdminConfiguracoes />);

    await waitFor(() => {
      expect(edgeInvokeMock).toHaveBeenCalledWith("app-settings", {
        body: { action: "get_admin" },
      });
    });

    expect(screen.queryByRole("heading", { name: /conexao moodle/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /limiares de risco/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /salvar limiares de risco/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^claris ia$/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /^provider$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /claris ia - correcao de atividade/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /testar conexao/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /salvar claris ia/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^prompt de instrucoes personalizadas$/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /claris ia - correcao de atividade/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /salvar correcao com ia/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^prompt de instrucoes personalizadas do feedback$/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /limpeza operacional do banco/i })).toBeInTheDocument();
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
    expect(edgeInvokeMock).not.toHaveBeenCalledWith(
      "app-settings",
      expect.objectContaining({ body: expect.objectContaining({ action: "update_risk_thresholds" }) }),
    );
  });

  it("saves risk threshold settings", async () => {
    const user = userEvent.setup();
    render(<AdminConfiguracoes />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /salvar limiares de risco/i })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: /salvar limiares de risco/i }));

    await waitFor(() => {
      expect(edgeInvokeMock).toHaveBeenCalledWith("app-settings", {
        body: {
          action: "update_risk_thresholds",
          riskThresholdDays: { atencao: 7, risco: 14, critico: 30 },
        },
      });
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

    await user.click(screen.getByRole("combobox", { name: /^modelo$/i }));
    await user.click(screen.getByRole("option", { name: /gpt-4o mini/i }));
    await user.type(screen.getByLabelText(/chave api/i), "sk-test");

    await user.click(screen.getByRole("button", { name: /testar conexao/i }));

    await waitFor(() => {
      expect(edgeInvokeMock).toHaveBeenCalledWith(
        "claris-llm-test",
        expect.objectContaining({
          body: expect.objectContaining({
            action: "test_connection",
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

  it("shows recommended badge for the default suggested model", async () => {
    const user = userEvent.setup();
    render(<AdminConfiguracoes />);

    await user.click(screen.getByRole("combobox", { name: /^modelo$/i }));
    await user.click(screen.getByRole("option", { name: /gpt-5 mini/i }));

    expect(await screen.findByText(/recomendado/i)).toBeInTheDocument();
  });

  it("saves claris custom instructions together with connection settings", async () => {
    const user = userEvent.setup();
    render(<AdminConfiguracoes />);

    await user.click(screen.getByRole("combobox", { name: /^modelo$/i }));
    await user.click(screen.getByRole("option", { name: /gpt-4o mini/i }));
    await user.type(screen.getByLabelText(/chave api/i), "sk-test");
    await user.type(
      screen.getByLabelText(/^prompt de instrucoes personalizadas$/i),
      "Priorize proximos passos e responda de forma mais consultiva.",
    );

    await user.click(screen.getByRole("button", { name: /salvar claris ia/i }));

    await waitFor(() => {
      expect(edgeInvokeMock).toHaveBeenCalledWith(
        "app-settings",
        expect.objectContaining({
          body: expect.objectContaining({
            action: "update_claris",
            settings: expect.objectContaining({
            model: "gpt-4o-mini",
            customInstructions: "Priorize proximos passos e responda de forma mais consultiva.",
          }),
        }),
        }),
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
      expect(edgeInvokeMock).toHaveBeenCalledWith(
        "app-settings",
        expect.objectContaining({
          body: expect.objectContaining({
            action: "update_ai_grading",
            settings: expect.objectContaining({
            enabled: true,
            timeoutMs: 45000,
            customInstructions: "Comece pelos pontos fortes e use linguagem mais acolhedora.",
          }),
        }),
        }),
      );
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/correcao com ia salva/i),
      }),
    );
  });
});
