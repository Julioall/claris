import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import PendingTasks from "@/pages/PendingTasks";

const usePendingTasksDataMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const updateTaskStatusMock = vi.fn();
const deleteTaskMock = vi.fn();
const refetchMock = vi.fn();

vi.mock("@/hooks/usePendingTasksData", () => ({
  usePendingTasksData: () => usePendingTasksDataMock(),
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

    updateTaskStatusMock.mockResolvedValue(true);
    deleteTaskMock.mockResolvedValue(true);

    usePendingTasksDataMock.mockReturnValue({
      tasks: [
        {
          id: "t-1",
          title: "Contato urgente",
          description: "Entrar em contato com aluno",
          status: "aberta",
          task_type: "interna",
          automation_type: "manual",
          is_recurring: false,
          priority: "alta",
          due_date: "2099-01-01T00:00:00.000Z",
          student_id: "s-1",
          student: { full_name: "Ana Silva" },
          course_id: "c-1",
          course: { short_name: "MAT" },
        },
        {
          id: "t-2",
          title: "Ajustar calendario",
          description: "Revisar prazos",
          status: "em_andamento",
          task_type: "moodle",
          automation_type: "recurring",
          is_recurring: true,
          priority: "media",
          due_date: "2099-02-01T00:00:00.000Z",
          student_id: "s-2",
          student: { full_name: "Bruno Costa" },
          course_id: "c-1",
          course: { short_name: "MAT" },
        },
      ],
      courses: [{ id: "c-1", short_name: "MAT" }],
      isLoading: false,
      updateTaskStatus: updateTaskStatusMock,
      deleteTask: deleteTaskMock,
      refetch: refetchMock,
    });
  });

  it("shows loading indicator while tasks are loading", () => {
    usePendingTasksDataMock.mockReturnValue({
      tasks: [],
      courses: [],
      isLoading: true,
      updateTaskStatus: updateTaskStatusMock,
      deleteTask: deleteTaskMock,
      refetch: refetchMock,
    });

    const { container } = renderPage();
    expect(container.querySelector('[data-testid="spinner"]')).toBeInTheDocument();
  });

  it("opens the create dialog and no longer shows automation actions", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByTestId("new-task-dialog")).toHaveTextContent("open:false");
    expect(screen.queryByRole("button", { name: /autom/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /nova tarefa/i }));

    expect(screen.getByTestId("new-task-dialog")).toHaveTextContent("open:true");
  });

  it("moves an open task to in progress from the list view", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTitle(/iniciar tarefa/i));

    await waitFor(() => {
      expect(updateTaskStatusMock).toHaveBeenCalledWith("t-1", "em_andamento");
    });
    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringMatching(/em andamento/i));
  });

  it("renders kanban mode and allows moving tasks there", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("tab", { name: /kanban/i }));
    await user.click(screen.getByRole("button", { name: /concluir/i }));

    await waitFor(() => {
      expect(updateTaskStatusMock).toHaveBeenCalledWith("t-2", "resolvida");
    });
  });
});
