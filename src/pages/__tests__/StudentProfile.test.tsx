import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StudentProfile from "@/pages/StudentProfile";

const useStudentProfileMock = vi.fn();

vi.mock("@/hooks/useStudentProfile", () => ({
  useStudentProfile: (...args: unknown[]) => useStudentProfileMock(...args),
}));

vi.mock("@/components/student/StudentGradesTab", () => ({
  StudentGradesTab: ({ studentId }: { studentId: string }) => (
    <div data-testid="student-grades-tab">{studentId}</div>
  ),
}));

vi.mock("@/components/chat/ChatWindow", () => ({
  ChatWindow: ({
    studentName,
    moodleUserId,
  }: {
    studentName: string;
    moodleUserId: number;
  }) => (
    <div data-testid="student-chat-window">
      {studentName}:{moodleUserId}
    </div>
  ),
}));

vi.mock("@/components/actions/NewActionDialog", () => ({
  NewActionDialog: ({ open }: { open: boolean }) => (
    <div data-testid="new-student-action-dialog">open:{String(open)}</div>
  ),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/alunos/s-1"]}>
      <Routes>
        <Route path="/alunos/:id" element={<StudentProfile />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StudentProfile page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStudentProfileMock.mockReturnValue({
      student: {
        id: "s-1",
        full_name: "Ana Silva",
        email: "ana@example.com",
        current_risk_level: "risco",
        tags: ["falta"],
        risk_reasons: ["sem_acesso_recente"],
        moodle_user_id: 99,
        last_access: "2026-02-20T00:00:00.000Z",
      },
      pendingTasks: [
        {
          id: "t-1",
          title: "Pendencia 1",
          status: "aberta",
          task_type: "manual",
          priority: "alta",
          due_date: "2099-01-01T00:00:00.000Z",
          description: "Descrição",
        },
      ],
      actions: [
        {
          id: "a-1",
          action_type: "contato",
          status: "planejada",
          description: "Ação de contato",
          created_at: "2026-02-20T00:00:00.000Z",
        },
      ],
      notes: [
        {
          id: "n-1",
          content: "Observação importante",
          created_at: "2026-02-20T00:00:00.000Z",
        },
      ],
      stats: {
        pendingTasksCount: 1,
        actionsCount: 1,
        lastActionDate: "2026-02-20T00:00:00.000Z",
      },
      isLoading: false,
      error: null,
    });
  });

  it("shows loading state", () => {
    useStudentProfileMock.mockReturnValue({
      student: null,
      pendingTasks: [],
      actions: [],
      notes: [],
      stats: { pendingTasksCount: 0, actionsCount: 0, lastActionDate: null },
      isLoading: true,
      error: null,
    });

    const { container } = renderPage();
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows error state when student is missing", () => {
    useStudentProfileMock.mockReturnValue({
      student: null,
      pendingTasks: [],
      actions: [],
      notes: [],
      stats: { pendingTasksCount: 0, actionsCount: 0, lastActionDate: null },
      isLoading: false,
      error: "Erro ao carregar aluno",
    });

    renderPage();
    expect(screen.getByText(/erro ao carregar aluno/i)).toBeInTheDocument();
  });

  it("renders profile data and opens new action dialog", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText(/motivos do risco/i)).toBeInTheDocument();
    expect(screen.getByText(/pendencia 1/i)).toBeInTheDocument();
    expect(screen.getByTestId("new-student-action-dialog")).toHaveTextContent(
      "open:false",
    );

    await user.click(screen.getByRole("button", { name: /nova a/i }));

    expect(screen.getByTestId("new-student-action-dialog")).toHaveTextContent(
      "open:true",
    );
  });

  it("renders chat tab with student moodle id", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("tab", { name: /chat/i }));

    expect(screen.getByTestId("student-chat-window")).toHaveTextContent(
      "Ana Silva:99",
    );
  });
});
