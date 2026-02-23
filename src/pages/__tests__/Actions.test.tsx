import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Actions from "@/pages/Actions";

const useActionsDataMock = vi.fn();
const useAuthMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const markAsCompletedMock = vi.fn();
const deleteActionMock = vi.fn();
const fromMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const orderMock = vi.fn();

vi.mock("@/hooks/useActionsData", () => ({
  useActionsData: () => useActionsDataMock(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock("@/components/actions/NewActionDialog", () => ({
  NewActionDialog: ({ open }: { open: boolean }) => (
    <div data-testid="new-action-dialog">open:{String(open)}</div>
  ),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <Actions />
    </MemoryRouter>,
  );
}

describe("Actions page", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: "user-1" } });
    markAsCompletedMock.mockResolvedValue(true);
    deleteActionMock.mockResolvedValue(true);

    useActionsDataMock.mockReturnValue({
      actions: [
        {
          id: "a-1",
          action_type: "contato",
          status: "planejada",
          description: "Ligar para aluno",
          student_id: "s-1",
          student: { full_name: "Ana Silva" },
          course_id: "c-1",
          course: { name: "Curso 1" },
          scheduled_date: "2099-01-01T00:00:00.000Z",
          completed_at: null,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      isLoading: false,
      refetch: vi.fn(),
      markAsCompleted: markAsCompletedMock,
      deleteAction: deleteActionMock,
    });

    orderMock.mockResolvedValue({
      data: [{ name: "contato", label: "Contato" }],
      error: null,
    });
    eqMock.mockReturnValue({ order: orderMock });
    selectMock.mockReturnValue({ eq: eqMock });
    fromMock.mockReturnValue({ select: selectMock });
  });

  it("shows skeleton loading state", () => {
    useAuthMock.mockReturnValue({ user: null });
    useActionsDataMock.mockReturnValue({
      actions: [],
      isLoading: true,
      refetch: vi.fn(),
      markAsCompleted: markAsCompletedMock,
      deleteAction: deleteActionMock,
    });

    const { container } = renderPage();
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("opens new action dialog", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByTestId("new-action-dialog")).toHaveTextContent("open:false");

    await user.click(screen.getByRole("button", { name: /nova a/i }));

    expect(screen.getByTestId("new-action-dialog")).toHaveTextContent("open:true");
  });

  it("marks action as completed and allows deleting action", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTitle(/marcar como conclu/i));
    await user.click(screen.getByTitle(/excluir a/i));

    await waitFor(() => {
      expect(markAsCompletedMock).toHaveBeenCalledWith("a-1");
      expect(deleteActionMock).toHaveBeenCalledWith("a-1");
    });
    expect(toastSuccessMock).toHaveBeenCalled();
  });
});
