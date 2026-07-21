import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminLogsErros from "@/features/admin/pages/AdminLogsErros";

const invokeMock = vi.fn();
const toastMock = vi.fn();

vi.mock("@/integrations/http/edge-function-client", () => ({
  invokeEdgeFunction: (...args: unknown[]) => invokeMock(...args),
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

function mockLogsQuery(logs: unknown[]) {
  invokeMock.mockResolvedValue({
    contractVersion: 1,
    items: logs,
    page: 1,
    pageSize: 30,
    totalCount: logs.length,
    totalPages: 1,
  });
}

describe("AdminLogsErros page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state then empty state when no logs", async () => {
    mockLogsQuery([]);

    renderWithClient(<AdminLogsErros />);

    await waitFor(() => {
      expect(screen.getByText(/nenhum log encontrado/i)).toBeInTheDocument();
    });
  });

  it("renders log rows when data is present", async () => {
    const fakeLogs = [
      {
        id: "log-1",
        userId: "user-1",
        severity: "error",
        category: "ui",
        message: "Test error message",
        payload: {},
        context: {},
        resolved: false,
        resolvedAt: null,
        resolvedBy: null,
        createdAt: new Date().toISOString(),
      },
    ];

    mockLogsQuery(fakeLogs);

    renderWithClient(<AdminLogsErros />);

    await waitFor(() => {
      expect(screen.getByText("Test error message")).toBeInTheDocument();
    });

    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.getByText("ui")).toBeInTheDocument();
  });

  it("renders filter controls", async () => {
    mockLogsQuery([]);

    renderWithClient(<AdminLogsErros />);

    expect(screen.getByPlaceholderText(/buscar por mensagem/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /logs de erro/i })).toBeInTheDocument();
  });
});
