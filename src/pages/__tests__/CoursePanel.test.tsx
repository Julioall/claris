import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CoursePanel from "@/pages/CoursePanel";

const useCoursePanelMock = vi.fn();
const useAuthMock = vi.fn();
const toggleActivityVisibilityMock = vi.fn();

vi.mock("@/hooks/useCoursePanel", () => ({
  useCoursePanel: (...args: unknown[]) => useCoursePanelMock(...args),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
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
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      isEditMode: false,
    });

    useCoursePanelMock.mockReturnValue({
      course: {
        id: "c-1",
        name: "Curso de Matematica",
        category: "Exatas",
        last_sync: "2026-02-20T00:00:00.000Z",
        start_date: "2026-01-01T00:00:00.000Z",
        end_date: "2026-12-31T00:00:00.000Z",
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
          moodle_activity_id: 321,
          activity_name: "Atividade 1",
          activity_type: "assignment",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: null,
          status: "pending",
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
      toggleActivityVisibility: toggleActivityVisibilityMock,
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
      toggleActivityVisibility: toggleActivityVisibilityMock,
    });

    const { container } = renderPage();
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
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
      toggleActivityVisibility: toggleActivityVisibilityMock,
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
  });
});
