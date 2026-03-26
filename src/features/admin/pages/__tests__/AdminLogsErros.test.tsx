import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminLogsErros from "@/features/admin/pages/AdminLogsErros";

const fromMock = vi.fn();
const toastMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

vi.mock("@/lib/csv", () => ({
  exportToCsv: vi.fn(),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("AdminLogsErros page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state then empty state when no logs", async () => {
    const eqMock = vi.fn().mockResolvedValue({ data: [], error: null });
    fromMock.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            eq: eqMock,
          }),
        }),
      }),
    }));

    renderWithClient(<AdminLogsErros />);

    await waitFor(() => {
      expect(screen.getByText(/nenhum log encontrado/i)).toBeInTheDocument();
    });
  });

  it("renders log rows when data is present", async () => {
    const fakeLogs = [
      {
        id: "log-1",
        user_id: "user-1",
        severity: "error",
        category: "ui",
        message: "Test error message",
        payload: {},
        context: {},
        resolved: false,
        resolved_at: null,
        created_at: new Date().toISOString(),
      },
    ];

    fromMock.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: fakeLogs, error: null }),
          }),
        }),
      }),
    }));

    renderWithClient(<AdminLogsErros />);

    await waitFor(() => {
      expect(screen.getByText("Test error message")).toBeInTheDocument();
    });

    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.getByText("ui")).toBeInTheDocument();
  });

  it("renders filter controls", async () => {
    fromMock.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    }));

    renderWithClient(<AdminLogsErros />);

    expect(screen.getByPlaceholderText(/buscar por mensagem/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /logs de erro/i })).toBeInTheDocument();
  });
});
