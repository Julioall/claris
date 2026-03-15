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
          description: "Descricao",
        },
      ],
      notes: [
        {
          id: "n-1",
          content: "Observacao importante",
          created_at: "2026-02-20T00:00:00.000Z",
        },
      ],
      stats: {
        pendingTasksCount: 1,
      },
      isLoading: false,
      error: null,
    });
  });

  it("shows loading state", () => {
    useStudentProfileMock.mockReturnValue({
      student: null,
      pendingTasks: [],
      notes: [],
      stats: { pendingTasksCount: 0 },
      isLoading: true,
      error: null,
    });

    const { container } = renderPage();
    expect(container.querySelector('[data-testid="spinner"]')).toBeInTheDocument();
  });

  it("shows error state when student is missing", () => {
    useStudentProfileMock.mockReturnValue({
      student: null,
      pendingTasks: [],
      notes: [],
      stats: { pendingTasksCount: 0 },
      isLoading: false,
      error: "Erro ao carregar aluno",
    });

    renderPage();
    expect(screen.getByText(/erro ao carregar aluno/i)).toBeInTheDocument();
  });

  it("renders profile data without the old actions flow", () => {
    renderPage();

    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText(/motivos do risco/i)).toBeInTheDocument();
    expect(screen.getByText(/pendencia 1/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nova a/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", {
        name: (name) => name.trim().toLowerCase() === "acoes",
      }),
    ).not.toBeInTheDocument();
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
