import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";
import { useClarisSuggestions } from "@/hooks/useClarisSuggestions";

// ─── Module mocks ──────────────────────────────────────────────────────────
const useAuthMock = vi.fn();
const invokeMock = vi.fn();
const fromMock = vi.fn();
const getSessionMock = vi.fn();
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: () => getSessionMock() },
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

// ─── QueryClient wrapper ───────────────────────────────────────────────────
function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

// ─── Chainable query mock helpers ─────────────────────────────────────────
const selectMock = vi.fn();
const eqMock = vi.fn();
const orMock = vi.fn();
const orderMock = vi.fn();
const limitMock = vi.fn();
const updateMock = vi.fn();

function setupFromChain(tableMock: (table: string) => Record<string, unknown>) {
  fromMock.mockImplementation(tableMock);
}

function setupSuggestionsRead(suggestions: unknown[]) {
  selectMock.mockReturnValue({ eq: eqMock });
  eqMock.mockReturnValue({ or: orMock });
  orMock.mockReturnValue({ order: orderMock });
  orderMock.mockReturnValue({ limit: limitMock });
  limitMock.mockResolvedValue({ data: suggestions, error: null });

  setupFromChain((table: string) => {
    if (table === "claris_suggestions") {
      return { select: selectMock };
    }
    return {};
  });
}

function buildPendingSuggestion(id = "sug-1") {
  return {
    id,
    type: "interrupted_contact",
    title: `Retomar contato — ${id}`,
    body: "Sem contato recente.",
    reason: "30 dias sem contato",
    analysis: "Risco elevado",
    expected_impact: "Melhoria no engajamento",
    trigger_engine: "communication",
    trigger_context: { trigger_key: "interrupted_contact" },
    priority: "high",
    status: "pending",
    entity_type: "student",
    entity_id: `student-${id}`,
    entity_name: "Ana Silva",
    action_type: "create_task",
    action_payload: { title: "Contatar Ana Silva", description: "Desc" },
    suggested_at: "2026-03-18T12:00:00.000Z",
    expires_at: null,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────
describe("useClarisSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: "user-1" } });
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    invokeMock.mockResolvedValue({ error: null });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("returns empty suggestions when user is not authenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });
    setupSuggestionsRead([]);

    const { result } = renderHook(() => useClarisSuggestions(), {
      wrapper: createWrapper(),
    });

    // Query is disabled so isLoading stays false and suggestions stays []
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.suggestions).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("fetches and returns pending suggestions for authenticated user", async () => {
    const pending = [buildPendingSuggestion("sug-1"), buildPendingSuggestion("sug-2")];
    setupSuggestionsRead(pending);

    const { result } = renderHook(() => useClarisSuggestions(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(2);
    });

    expect(result.current.suggestions[0].id).toBe("sug-1");
    expect(result.current.suggestions[1].id).toBe("sug-2");
    expect(result.current.isLoading).toBe(false);
  });

  it("exposes suggestion title and body fields", async () => {
    const pending = [buildPendingSuggestion()];
    setupSuggestionsRead(pending);

    const { result } = renderHook(() => useClarisSuggestions(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(1);
    });

    const s = result.current.suggestions[0];
    expect(s.title).toBe("Retomar contato — sug-1");
    expect(s.body).toBe("Sem contato recente.");
    expect(s.trigger_engine).toBe("communication");
    expect(s.priority).toBe("high");
  });

  it("triggerProactiveGeneration invokes the edge function when session exists", async () => {
    setupSuggestionsRead([]);

    const { result } = renderHook(() => useClarisSuggestions(), {
      wrapper: createWrapper(),
    });

    // Clear sessionStorage so the rate-limit does not block the call
    sessionStorage.removeItem("claris_proactive_last_run");

    await act(async () => {
      await result.current.triggerProactiveGeneration();
    });

    expect(invokeMock).toHaveBeenCalledWith("generate-proactive-suggestions");
  });

  it("triggerProactiveGeneration is rate-limited by sessionStorage", async () => {
    setupSuggestionsRead([]);

    // Simulate a recent run (1 minute ago — under the 30-min window)
    sessionStorage.setItem(
      "claris_proactive_last_run",
      String(Date.now() - 60_000),
    );

    const { result } = renderHook(() => useClarisSuggestions(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.triggerProactiveGeneration();
    });

    expect(invokeMock).not.toHaveBeenCalled();

    // Cleanup
    sessionStorage.removeItem("claris_proactive_last_run");
  });

  it("triggerProactiveGeneration does nothing when user is not authenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });
    setupSuggestionsRead([]);
    sessionStorage.removeItem("claris_proactive_last_run");

    const { result } = renderHook(() => useClarisSuggestions(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.triggerProactiveGeneration();
    });

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("triggerProactiveGeneration does nothing when there is no active session", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    setupSuggestionsRead([]);
    sessionStorage.removeItem("claris_proactive_last_run");

    const { result } = renderHook(() => useClarisSuggestions(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.triggerProactiveGeneration();
    });

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("dismissSuggestion updates the record status to dismissed", async () => {
    const pending = [buildPendingSuggestion("sug-1")];
    setupSuggestionsRead(pending);

    // Setup dismiss chain
    const eqDismissMock = vi.fn().mockResolvedValue({ error: null });
    const updateReturnMock = { eq: eqDismissMock };

    // Setup cooldown insert chain
    const insertCooldownMock = vi.fn().mockResolvedValue({ error: null });

    setupFromChain((table: string) => {
      if (table === "claris_suggestions") {
        return {
          select: selectMock,
          update: updateMock,
        };
      }
      if (table === "claris_suggestion_cooldowns") {
        return { insert: insertCooldownMock };
      }
      return {};
    });

    updateMock.mockReturnValue(updateReturnMock);

    const { result } = renderHook(() => useClarisSuggestions(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(1);
    });

    await act(async () => {
      result.current.dismissSuggestion("sug-1");
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "dismissed" }),
    );
    expect(eqDismissMock).toHaveBeenCalledWith("id", "sug-1");
  });

  it("acceptSuggestion updates the record status to accepted", async () => {
    const pending = [buildPendingSuggestion("sug-1")];
    setupSuggestionsRead(pending);

    const eqAcceptMock = vi.fn().mockResolvedValue({ error: null });
    const updateReturnMock = { eq: eqAcceptMock };

    setupFromChain((table: string) => {
      if (table === "claris_suggestions") {
        return {
          select: selectMock,
          update: updateMock,
        };
      }
      return {};
    });

    updateMock.mockReturnValue(updateReturnMock);

    const { result } = renderHook(() => useClarisSuggestions(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(1);
    });

    await act(async () => {
      result.current.acceptSuggestion(result.current.suggestions[0]);
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "accepted" }),
    );
    expect(eqAcceptMock).toHaveBeenCalledWith("id", "sug-1");
  });
});

