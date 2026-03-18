import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClarisSuggestions } from "@/components/dashboard/ClarisSuggestions";
import type { ClarisSuggestion } from "@/hooks/useClarisSuggestions";

const useClarisSuggestionsMock = vi.fn();

vi.mock("@/hooks/useClarisSuggestions", () => ({
  useClarisSuggestions: () => useClarisSuggestionsMock(),
}));

function buildSuggestion(overrides: Partial<ClarisSuggestion> = {}): ClarisSuggestion {
  return {
    id: "sug-1",
    type: "interrupted_contact",
    title: "Retomar contato com Ana Silva",
    body: "O aluno Ana Silva está com status em risco e não há registro de contato recente.",
    reason: "Aluno sem contato nos últimos 30 dias",
    analysis: "Risco elevado sem interação",
    expected_impact: "Melhoria no engajamento do aluno",
    trigger_engine: "communication",
    trigger_context: { trigger_key: "interrupted_contact" },
    priority: "high",
    status: "pending",
    entity_type: "student",
    entity_id: "student-1",
    entity_name: "Ana Silva",
    action_type: "create_task",
    action_payload: {
      title: "Contatar Ana Silva",
      description: "Realizar contato com Ana Silva",
    },
    suggested_at: "2026-03-18T12:00:00.000Z",
    expires_at: null,
    ...overrides,
  };
}

function defaultHookValue(
  suggestions: ClarisSuggestion[] = [],
  overrides: Record<string, unknown> = {},
) {
  return {
    suggestions,
    isLoading: false,
    isGenerating: false,
    acceptSuggestion: vi.fn(),
    dismissSuggestion: vi.fn(),
    triggerProactiveGeneration: vi.fn(),
    forceGenerate: vi.fn(),
    ...overrides,
  };
}

describe("ClarisSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the panel with empty state when there are no suggestions", () => {
    useClarisSuggestionsMock.mockReturnValue(defaultHookValue([]));

    render(<ClarisSuggestions />);
    expect(screen.getByText("Sugestões da Claris IA")).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma sugestão no momento/)).toBeInTheDocument();
  });

  it("renders loading skeleton while loading", () => {
    useClarisSuggestionsMock.mockReturnValue(
      defaultHookValue([], { isLoading: true }),
    );

    render(<ClarisSuggestions />);
    expect(screen.getByText("Sugestões da Claris IA")).toBeInTheDocument();
    // Loading skeletons are rendered (no empty state message visible)
    expect(screen.queryByText(/Nenhuma sugestão/)).not.toBeInTheDocument();
  });

  it("renders suggestion title, body and priority badge when suggestions are present", () => {
    const suggestion = buildSuggestion();
    useClarisSuggestionsMock.mockReturnValue(defaultHookValue([suggestion]));

    render(<ClarisSuggestions />);

    expect(screen.getByText("Sugestões da Claris IA")).toBeInTheDocument();
    expect(screen.getByText("Retomar contato com Ana Silva")).toBeInTheDocument();
    expect(screen.getByText(/O aluno Ana Silva está com status em risco/)).toBeInTheDocument();
    expect(screen.getByText("Alta")).toBeInTheDocument();
  });

  it("shows suggestion count badge in header", () => {
    const suggestions = [buildSuggestion(), buildSuggestion({ id: "sug-2", title: "Segunda sugestão" })];
    useClarisSuggestionsMock.mockReturnValue(defaultHookValue(suggestions));

    render(<ClarisSuggestions />);

    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows trigger engine badge for suggestions with trigger_engine", () => {
    const suggestion = buildSuggestion({ trigger_engine: "communication" });
    useClarisSuggestionsMock.mockReturnValue(defaultHookValue([suggestion]));

    render(<ClarisSuggestions />);

    expect(screen.getByText("Comunicação")).toBeInTheDocument();
  });

  it("shows entity name for suggestions with entity_name", () => {
    const suggestion = buildSuggestion({ entity_name: "Beatriz Costa" });
    useClarisSuggestionsMock.mockReturnValue(defaultHookValue([suggestion]));

    render(<ClarisSuggestions />);

    expect(screen.getByText(/Beatriz Costa/)).toBeInTheDocument();
  });

  it("shows action button for create_task suggestions", () => {
    const suggestion = buildSuggestion({ action_type: "create_task" });
    useClarisSuggestionsMock.mockReturnValue(defaultHookValue([suggestion]));

    render(<ClarisSuggestions />);

    expect(screen.getByRole("button", { name: /criar tarefa/i })).toBeInTheDocument();
  });

  it("shows action button for create_event suggestions", () => {
    const suggestion = buildSuggestion({ action_type: "create_event" });
    useClarisSuggestionsMock.mockReturnValue(defaultHookValue([suggestion]));

    render(<ClarisSuggestions />);

    expect(screen.getByRole("button", { name: /criar evento/i })).toBeInTheDocument();
  });

  it("shows action button for open_chat suggestions", () => {
    const suggestion = buildSuggestion({ action_type: "open_chat" });
    useClarisSuggestionsMock.mockReturnValue(defaultHookValue([suggestion]));

    render(<ClarisSuggestions />);

    expect(screen.getByRole("button", { name: /abrir chat/i })).toBeInTheDocument();
  });

  it("calls acceptSuggestion when action button is clicked", async () => {
    const suggestion = buildSuggestion({ action_type: "create_task" });
    const acceptSuggestion = vi.fn();
    useClarisSuggestionsMock.mockReturnValue(
      defaultHookValue([suggestion], { acceptSuggestion }),
    );

    render(<ClarisSuggestions />);

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /criar tarefa/i }));
    });

    expect(acceptSuggestion).toHaveBeenCalledWith(suggestion);
  });

  it("calls dismissSuggestion when X button is clicked", async () => {
    const suggestion = buildSuggestion();
    const dismissSuggestion = vi.fn();
    useClarisSuggestionsMock.mockReturnValue(
      defaultHookValue([suggestion], { dismissSuggestion }),
    );

    render(<ClarisSuggestions />);

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /recusar sugestão/i }));
    });

    expect(dismissSuggestion).toHaveBeenCalledWith("sug-1");
  });

  it("calls triggerProactiveGeneration on mount", () => {
    const triggerProactiveGeneration = vi.fn();
    useClarisSuggestionsMock.mockReturnValue(
      defaultHookValue([], { triggerProactiveGeneration }),
    );

    render(<ClarisSuggestions />);

    expect(triggerProactiveGeneration).toHaveBeenCalledTimes(1);
  });

  it("calls forceGenerate when the refresh button is clicked", async () => {
    const forceGenerate = vi.fn();
    useClarisSuggestionsMock.mockReturnValue(
      defaultHookValue([], { forceGenerate }),
    );

    render(<ClarisSuggestions />);

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /gerar novas sugestões/i }));
    });

    expect(forceGenerate).toHaveBeenCalledTimes(1);
  });

  it("shows spinning refresh button while isGenerating", () => {
    useClarisSuggestionsMock.mockReturnValue(
      defaultHookValue([], { isGenerating: true }),
    );

    render(<ClarisSuggestions />);

    const refreshBtn = screen.getByRole("button", { name: /gerar novas sugestões/i });
    expect(refreshBtn).toBeDisabled();
  });

  it("expands and collapses the suggestion list when the toggle button is clicked", async () => {
    const suggestion = buildSuggestion();
    useClarisSuggestionsMock.mockReturnValue(defaultHookValue([suggestion]));

    render(<ClarisSuggestions />);

    // Initially expanded
    expect(screen.getByText("Retomar contato com Ana Silva")).toBeInTheDocument();

    // Collapse
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /ocultar/i }));
    });

    await waitFor(() => {
      expect(screen.queryByText("Retomar contato com Ana Silva")).not.toBeInTheDocument();
    });

    // Re-expand
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /ver todas/i }));
    });

    await waitFor(() => {
      expect(screen.getByText("Retomar contato com Ana Silva")).toBeInTheDocument();
    });
  });

  it("shows expandable analysis section when reason is available", async () => {
    const suggestion = buildSuggestion({
      reason: "Aluno sem contato nos últimos 30 dias",
    });
    useClarisSuggestionsMock.mockReturnValue(defaultHookValue([suggestion]));

    render(<ClarisSuggestions />);

    // Details toggle should be visible
    const detailsToggle = screen.getByRole("button", { name: /ver análise/i });
    expect(detailsToggle).toBeInTheDocument();

    // Expand analysis
    await act(async () => {
      await userEvent.click(detailsToggle);
    });

    await waitFor(() => {
      expect(screen.getByText(/Aluno sem contato nos últimos 30 dias/)).toBeInTheDocument();
    });
  });

  it("renders multiple suggestions", () => {
    const suggestions = [
      buildSuggestion({ id: "sug-1", title: "Sugestão um" }),
      buildSuggestion({ id: "sug-2", title: "Sugestão dois", type: "overdue_task", trigger_engine: "tasks" }),
      buildSuggestion({ id: "sug-3", title: "Sugestão três", priority: "urgent" }),
    ];
    useClarisSuggestionsMock.mockReturnValue(defaultHookValue(suggestions));

    render(<ClarisSuggestions />);

    expect(screen.getByText("Sugestão um")).toBeInTheDocument();
    expect(screen.getByText("Sugestão dois")).toBeInTheDocument();
    expect(screen.getByText("Sugestão três")).toBeInTheDocument();
    expect(screen.getByText("Urgente")).toBeInTheDocument();
  });

  it("renders suggestion with urgent priority style", () => {
    const suggestion = buildSuggestion({ priority: "urgent" });
    useClarisSuggestionsMock.mockReturnValue(defaultHookValue([suggestion]));

    render(<ClarisSuggestions />);

    expect(screen.getByText("Urgente")).toBeInTheDocument();
  });

  it("renders suggestion with low priority style", () => {
    const suggestion = buildSuggestion({ priority: "low" });
    useClarisSuggestionsMock.mockReturnValue(defaultHookValue([suggestion]));

    render(<ClarisSuggestions />);

    expect(screen.getByText("Baixa")).toBeInTheDocument();
  });
});
