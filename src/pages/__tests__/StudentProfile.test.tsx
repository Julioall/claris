import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StudentProfile from "@/features/students/pages/StudentProfilePage";

const useStudentProfileMock = vi.fn();

vi.mock("@/features/students/hooks/useStudentProfile", () => ({
  useStudentProfile: (...args: unknown[]) => useStudentProfileMock(...args),
}));

vi.mock("@/components/student/StudentGradesTab", () => ({
  StudentGradesTab: ({ studentId }: { studentId: string }) => (
    <div data-testid="student-grades-tab">{studentId}</div>
  ),
}));

vi.mock("@/components/student/StudentHistoryTab", () => ({
  StudentHistoryTab: ({ studentId }: { studentId: string }) => (
    <div data-testid="student-history-tab">{studentId}</div>
  ),
}));

vi.mock("@/features/claris/components/ChatWindow", () => ({
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
      isLoading: false,
      error: null,
    });
  });

  it("shows loading state", () => {
    useStudentProfileMock.mockReturnValue({
      student: null,
      isLoading: true,
      error: null,
    });

    const { container } = renderPage();
    expect(container.querySelector('[data-testid="spinner"]')).toBeInTheDocument();
  });

  it("shows error state when student is missing", () => {
    useStudentProfileMock.mockReturnValue({
      student: null,
      isLoading: false,
      error: "Erro ao carregar aluno",
    });

    renderPage();
    expect(screen.getByText(/erro ao carregar aluno/i)).toBeInTheDocument();
  });

  it("renders profile data", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Ana Silva" })).toBeInTheDocument();
    expect(screen.getByText(/dados completos do aluno/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", {
        name: (name) => name.trim().toLowerCase() === "acoes",
      }),
    ).not.toBeInTheDocument();
  });

  it("renders Histórico tab replacing Observações", () => {
    renderPage();

    expect(screen.getByRole("tab", { name: /histórico/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /observações/i })).not.toBeInTheDocument();
  });

  it("does not render risk edit button", () => {
    renderPage();

    expect(screen.queryByRole("button", { name: /editar risco/i })).not.toBeInTheDocument();
  });

  it("renders StudentHistoryTab when Histórico tab is active", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("tab", { name: /histórico/i }));

    expect(screen.getByTestId("student-history-tab")).toBeInTheDocument();
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
