import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CoursePanel from "@/features/courses/pages/CoursePanelPage";

const useCoursePanelMock = vi.fn();
const useAuthMock = vi.fn();
const toggleActivityVisibilityMock = vi.fn();
const generateActivityGradeSuggestionsMock = vi.fn();
const approveStudentGradeSuggestionMock = vi.fn();
const useMoodleSessionMock = vi.fn();

vi.mock("@/features/courses/hooks/useCoursePanel", () => ({
  useCoursePanel: (...args: unknown[]) => useCoursePanelMock(...args),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/features/auth/context/MoodleSessionContext", () => ({
  useMoodleSession: () => useMoodleSessionMock(),
}));

vi.mock("@/features/students/api/gradeSuggestions", () => ({
  generateActivityGradeSuggestions: (...args: unknown[]) => generateActivityGradeSuggestionsMock(...args),
  approveStudentGradeSuggestion: (...args: unknown[]) => approveStudentGradeSuggestionMock(...args),
}));

vi.mock("@/components/attendance/CourseAttendanceTab", () => ({
  CourseAttendanceTab: ({ courseId }: { courseId: string }) => (
    <div data-testid="attendance-tab">{courseId}</div>
  ),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/cursos/c-1"]}>
      <Routes>
        <Route path="/cursos/:id" element={<CoursePanel />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CoursePanel page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMoodleSessionMock.mockReturnValue({
      moodleToken: "token-1",
      moodleUrl: "https://moodle.example.com",
      moodleUserId: 12,
    });
    generateActivityGradeSuggestionsMock.mockResolvedValue({
      data: {
        success: true,
        generatedCount: 1,
        errorCount: 0,
        message: "1 sugestao gerada com sucesso.",
        results: [
          {
            studentId: "s-2",
            studentActivityId: "sub-2",
            auditId: "audit-2",
            result: {
              status: "success",
              suggestedGrade: 8.5,
              suggestedFeedback: "A resposta apresenta boa cobertura dos pontos solicitados.",
              confidence: "high",
              sourcesUsed: [],
              warnings: [],
              evaluationStatus: "avaliacao_valida",
            },
          },
        ],
      },
      error: null,
    });
    approveStudentGradeSuggestionMock.mockResolvedValue({
      data: {
        success: true,
        approvedGrade: 9.5,
        approvedFeedback: "A resposta apresenta dominio consistente do conteudo.",
      },
      error: null,
    });
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      isEditMode: false,
      syncCourseIncremental: vi.fn(),
      isSyncing: false,
      isOfflineMode: false,
    });

    useCoursePanelMock.mockReturnValue({
      course: {
        id: "c-1",
        name: "Curso de Matematica",
        category: "Exatas",
        last_sync: "2026-02-20T00:00:00.000Z",
        start_date: "2026-01-01T00:00:00.000Z",
        end_date: "2026-12-31T00:00:00.000Z",
        effective_end_date: "2026-03-15T12:00:00.000Z",
        moodle_course_id: "123",
      },
      students: [
        {
          id: "s-1",
          full_name: "Ana Silva",
          email: "ana@example.com",
          current_risk_level: "atencao",
          last_access: "2026-02-19T00:00:00.000Z",
          avatar_url: null,
        },
      ],
      activities: [
        {
          id: "act-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assignment",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: null,
          status: "pending",
        },
      ],
      activitySubmissions: [
        {
          id: "sub-1",
          student_id: "s-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: 9.5,
          grade_max: 10,
          status: "completed",
          completed_at: "2026-03-09T00:00:00.000Z",
          submitted_at: "2026-03-09T00:00:00.000Z",
        },
        {
          id: "sub-2",
          student_id: "s-2",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: 10,
          status: "completed",
          completed_at: "2026-03-10T00:00:00.000Z",
          submitted_at: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "sub-3",
          student_id: "s-3",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: 10,
          status: "pending",
          completed_at: null,
          submitted_at: null,
        },
      ],
      stats: {
        totalStudents: 1,
        atRiskStudents: 1,
        totalActivities: 1,
        completionRate: 50,
        riskDistribution: {
          normal: 0,
          atencao: 1,
          risco: 0,
          critico: 0,
        },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      toggleActivityVisibility: toggleActivityVisibilityMock,
      isAttendanceEnabled: false,
      isLoadingAttendanceFlag: false,
      toggleAttendance: vi.fn(),
    });
  });

  it("shows loading state", () => {
    useCoursePanelMock.mockReturnValue({
      course: null,
      students: [],
      activities: [],
      stats: {
        totalStudents: 0,
        atRiskStudents: 0,
        totalActivities: 0,
        completionRate: 0,
        riskDistribution: { normal: 0, atencao: 0, risco: 0, critico: 0 },
      },
      isLoading: true,
      error: null,
      refetch: vi.fn(),
      toggleActivityVisibility: toggleActivityVisibilityMock,
      isAttendanceEnabled: false,
      isLoadingAttendanceFlag: false,
      toggleAttendance: vi.fn(),
    });

    const { container } = renderPage();
    expect(container.querySelector('[data-testid="spinner"]')).toBeInTheDocument();
  });

  it("shows not found state when course is missing", () => {
    useCoursePanelMock.mockReturnValue({
      course: null,
      students: [],
      activities: [],
      stats: {
        totalStudents: 0,
        atRiskStudents: 0,
        totalActivities: 0,
        completionRate: 0,
        riskDistribution: { normal: 0, atencao: 0, risco: 0, critico: 0 },
      },
      isLoading: false,
      error: "Curso nao encontrado",
      refetch: vi.fn(),
      toggleActivityVisibility: toggleActivityVisibilityMock,
      isAttendanceEnabled: false,
      isLoadingAttendanceFlag: false,
      toggleAttendance: vi.fn(),
    });

    renderPage();
    expect(
      screen.getByRole("heading", { level: 2, name: /curso n/i }),
    ).toBeInTheDocument();
  });

  it("renders course overview and stats", () => {
    renderPage();

    expect(screen.getByText("Curso de Matematica")).toBeInTheDocument();
    expect(screen.getByText(/alunos matriculados/i)).toBeInTheDocument();
    expect(screen.getByText(/distribui/i)).toBeInTheDocument();
    expect(screen.getByText("15/03/2026")).toBeInTheDocument();
  });

  it("expands assignment activity with per-student statuses", async () => {
    const user = userEvent.setup();

    useCoursePanelMock.mockReturnValue({
      course: {
        id: "c-1",
        name: "Curso de Matematica",
        category: "Exatas",
        last_sync: "2026-02-20T00:00:00.000Z",
        start_date: "2026-01-01T00:00:00.000Z",
        end_date: "2026-12-31T00:00:00.000Z",
        effective_end_date: "2026-03-15T12:00:00.000Z",
        moodle_course_id: "123",
      },
      students: [
        {
          id: "s-1",
          full_name: "Ana Silva",
          email: "ana@example.com",
          current_risk_level: "atencao",
          last_access: "2026-02-19T00:00:00.000Z",
          avatar_url: null,
        },
        {
          id: "s-2",
          full_name: "Bruno Souza",
          email: "bruno@example.com",
          current_risk_level: "normal",
          last_access: "2026-02-18T00:00:00.000Z",
          avatar_url: null,
        },
        {
          id: "s-3",
          full_name: "Carla Dias",
          email: "carla@example.com",
          current_risk_level: "risco",
          last_access: "2026-02-17T00:00:00.000Z",
          avatar_url: null,
        },
      ],
      activities: [
        {
          id: "act-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: null,
          status: "pending",
        },
      ],
      activitySubmissions: [
        {
          id: "sub-1",
          student_id: "s-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: 9.5,
          grade_max: 10,
          status: "completed",
          completed_at: "2026-03-09T00:00:00.000Z",
          submitted_at: "2026-03-09T00:00:00.000Z",
        },
        {
          id: "sub-2",
          student_id: "s-2",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: 10,
          status: "completed",
          completed_at: "2026-03-10T00:00:00.000Z",
          submitted_at: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "sub-3",
          student_id: "s-3",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: 10,
          status: "pending",
          completed_at: null,
          submitted_at: null,
        },
      ],
      stats: {
        totalStudents: 3,
        atRiskStudents: 1,
        totalActivities: 1,
        completionRate: 50,
        riskDistribution: {
          normal: 1,
          atencao: 1,
          risco: 1,
          critico: 0,
        },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      toggleActivityVisibility: toggleActivityVisibilityMock,
      isAttendanceEnabled: false,
      isLoadingAttendanceFlag: false,
      toggleAttendance: vi.fn(),
    });

    renderPage();

    await user.click(screen.getByRole("tab", { name: /atividades \(1\)/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /expandir entregas/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /expandir entregas/i }));

    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText(/nota: 9.5 \/ 10/i)).toBeInTheDocument();
    expect(screen.getByText("Bruno Souza")).toBeInTheDocument();
    expect(screen.getByText("Carla Dias")).toBeInTheDocument();
    expect(screen.getAllByText(/Pendente de Cor/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Pendente de Envio")).toBeInTheDocument();
  });
  it("generates inline suggestions for all submissions of an assignment activity", async () => {
    const user = userEvent.setup();

    useCoursePanelMock.mockReturnValue({
      course: {
        id: "c-1",
        name: "Curso de Matematica",
        category: "Exatas",
        last_sync: "2026-02-20T00:00:00.000Z",
        start_date: "2026-01-01T00:00:00.000Z",
        end_date: "2026-12-31T00:00:00.000Z",
        effective_end_date: "2026-03-15T12:00:00.000Z",
        moodle_course_id: "123",
      },
      students: [
        {
          id: "s-1",
          full_name: "Ana Silva",
          email: "ana@example.com",
          current_risk_level: "atencao",
          last_access: "2026-02-19T00:00:00.000Z",
          avatar_url: null,
        },
        {
          id: "s-2",
          full_name: "Bruno Souza",
          email: "bruno@example.com",
          current_risk_level: "normal",
          last_access: "2026-02-18T00:00:00.000Z",
          avatar_url: null,
        },
        {
          id: "s-3",
          full_name: "Carla Dias",
          email: "carla@example.com",
          current_risk_level: "risco",
          last_access: "2026-02-17T00:00:00.000Z",
          avatar_url: null,
        },
      ],
      activities: [
        {
          id: "act-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: null,
          status: "pending",
        },
      ],
      activitySubmissions: [
        {
          id: "sub-1",
          student_id: "s-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: 9.5,
          grade_max: 10,
          status: "completed",
          completed_at: "2026-03-09T00:00:00.000Z",
          submitted_at: "2026-03-09T00:00:00.000Z",
        },
        {
          id: "sub-2",
          student_id: "s-2",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: 10,
          status: "completed",
          completed_at: "2026-03-10T00:00:00.000Z",
          submitted_at: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "sub-3",
          student_id: "s-3",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: 10,
          status: "pending",
          completed_at: null,
          submitted_at: null,
        },
      ],
      stats: {
        totalStudents: 3,
        atRiskStudents: 2,
        totalActivities: 1,
        completionRate: 67,
        riskDistribution: {
          normal: 1,
          atencao: 1,
          risco: 1,
          critico: 0,
        },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      toggleActivityVisibility: toggleActivityVisibilityMock,
      isAttendanceEnabled: false,
      isLoadingAttendanceFlag: false,
      toggleAttendance: vi.fn(),
    });

    renderPage();

    await user.click(screen.getByRole("tab", { name: /atividades \(1\)/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /corrigir/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /corrigir/i }));

    await waitFor(() => {
      expect(generateActivityGradeSuggestionsMock).toHaveBeenCalledWith({
        session: {
          moodleToken: "token-1",
          moodleUrl: "https://moodle.example.com",
          moodleUserId: 12,
        },
        courseId: "c-1",
        moodleActivityId: "321",
      });
    });

    expect(screen.getByLabelText("Nota sugerida para Bruno Souza")).toHaveValue("8.5");
    expect(screen.getByLabelText("Feedback sugerido para Bruno Souza")).toHaveValue("A resposta apresenta boa cobertura dos pontos solicitados.");
    expect(screen.getByText("Sugestao pronta")).toBeInTheDocument();
    expect(screen.queryByLabelText("Feedback sugerido para Ana Silva")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Feedback sugerido para Carla Dias")).not.toBeInTheDocument();
  });

  it("hides the Corrigir action when there is no pending correction", async () => {
    useCoursePanelMock.mockReturnValue({
      course: {
        id: "c-1",
        name: "Curso de Matematica",
        category: "Exatas",
        last_sync: "2026-02-20T00:00:00.000Z",
        start_date: "2026-01-01T00:00:00.000Z",
        end_date: "2026-12-31T00:00:00.000Z",
        effective_end_date: "2026-03-15T12:00:00.000Z",
        moodle_course_id: "123",
      },
      students: [
        {
          id: "s-1",
          full_name: "Ana Silva",
          email: "ana@example.com",
          current_risk_level: "atencao",
          last_access: "2026-02-19T00:00:00.000Z",
          avatar_url: null,
        },
        {
          id: "s-2",
          full_name: "Bruno Souza",
          email: "bruno@example.com",
          current_risk_level: "normal",
          last_access: "2026-02-18T00:00:00.000Z",
          avatar_url: null,
        },
      ],
      activities: [
        {
          id: "act-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: null,
          status: "pending",
        },
      ],
      activitySubmissions: [
        {
          id: "sub-1",
          student_id: "s-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: 9.5,
          grade_max: 10,
          status: "graded",
          completed_at: "2026-03-09T00:00:00.000Z",
          submitted_at: "2026-03-09T00:00:00.000Z",
          graded_at: "2026-03-11T00:00:00.000Z",
        },
        {
          id: "sub-2",
          student_id: "s-2",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: 10,
          status: "pending",
          completed_at: null,
          submitted_at: null,
          graded_at: null,
        },
      ],
      stats: {
        totalStudents: 2,
        atRiskStudents: 1,
        totalActivities: 1,
        completionRate: 50,
        riskDistribution: {
          normal: 1,
          atencao: 1,
          risco: 0,
          critico: 0,
        },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      toggleActivityVisibility: toggleActivityVisibilityMock,
      isAttendanceEnabled: false,
      isLoadingAttendanceFlag: false,
      toggleAttendance: vi.fn(),
    });

    renderPage();

    await userEvent.click(screen.getByRole("tab", { name: /atividades \(1\)/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /expandir entregas/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /corrigir/i })).not.toBeInTheDocument();
  });
});
