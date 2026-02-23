import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import PendingTasks from "@/pages/PendingTasks";

const usePendingTasksDataMock = vi.fn();
const useAuthMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const markAsResolvedMock = vi.fn();
const deleteTaskMock = vi.fn();
const refetchMock = vi.fn();

vi.mock("@/hooks/usePendingTasksData", () => ({
  usePendingTasksData: () => usePendingTasksDataMock(),
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

vi.mock("@/components/pending-tasks/NewPendingTaskDialog", () => ({
  NewPendingTaskDialog: ({ open }: { open: boolean }) => (
    <div data-testid="new-task-dialog">open:{String(open)}</div>
  ),
}));

vi.mock("@/components/pending-tasks/GenerateAutomatedTasksDialog", () => ({
  GenerateAutomatedTasksDialog: ({ open }: { open: boolean }) => (
    <div data-testid="auto-task-dialog">open:{String(open)}</div>
  ),
}));

vi.mock("@/components/pending-tasks/AddTaskActionDialog", () => ({
  AddTaskActionDialog: ({
    open,
    pendingTaskId,
  }: {
    open: boolean;
    pendingTaskId: string;
  }) => <div data-testid="add-task-action-dialog">{open ? pendingTaskId : "closed"}</div>,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <PendingTasks />
    </MemoryRouter>,
  );
}

describe("PendingTasks page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: "user-1" } });
    markAsResolvedMock.mockResolvedValue(true);
    deleteTaskMock.mockResolvedValue(true);
    usePendingTasksDataMock.mockReturnValue({
      tasks: [
        {
          id: "t-1",
          title: "Contato urgente",
          description: "Entrar em contato com aluno",
          status: "aberta",
          task_type: "manual",
          automation_type: "manual",
          is_recurring: false,
          priority: "alta",
          due_date: "2099-01-01T00:00:00.000Z",
          student_id: "s-1",
          student: { full_name: "Ana Silva" },
          course_id: "c-1",
          course: { short_name: "MAT" },
        },
      ],
      courses: [{ id: "c-1", short_name: "MAT" }],
      isLoading: false,
      markAsResolved: markAsResolvedMock,
      deleteTask: deleteTaskMock,
      refetch: refetchMock,
    });
  });

  it("shows loading indicator while tasks are loading", () => {
    usePendingTasksDataMock.mockReturnValue({
      tasks: [],
      courses: [],
      isLoading: true,
      markAsResolved: markAsResolvedMock,
      deleteTask: deleteTaskMock,
      refetch: refetchMock,
    });

    const { container } = renderPage();
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("opens manual and automated task dialogs", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByTestId("new-task-dialog")).toHaveTextContent("open:false");
    expect(screen.getByTestId("auto-task-dialog")).toHaveTextContent("open:false");

    await user.click(screen.getByRole("button", { name: /nova pend/i }));
    await user.click(screen.getByRole("button", { name: /gerar autom/i }));

    expect(screen.getByTestId("new-task-dialog")).toHaveTextContent("open:true");
    expect(screen.getByTestId("auto-task-dialog")).toHaveTextContent("open:true");
  });

  it("marks a task as resolved and shows success toast", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTitle(/marcar como resolvida/i));

    await waitFor(() => {
      expect(markAsResolvedMock).toHaveBeenCalledWith("t-1");
    });
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("opens add action dialog for selected task", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTitle(/adicionar a/i));

    expect(screen.getByTestId("add-task-action-dialog")).toHaveTextContent("t-1");
  });
});
