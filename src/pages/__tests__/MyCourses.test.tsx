import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyCourses from "@/features/courses/pages/MyCoursesPage";
import { APP_PERMISSIONS } from "@/lib/access-control";

const useAllCoursesDataMock = vi.fn();
const useAuthMock = vi.fn();
const usePermissionsMock = vi.fn();
const canMock = vi.fn();
const toggleAttendanceMock = vi.fn();
const toggleAttendanceMultipleMock = vi.fn();

vi.mock("@/features/courses/hooks/useAllCoursesData", () => ({
  useAllCoursesData: (...args: unknown[]) => useAllCoursesDataMock(...args),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => usePermissionsMock(),
}));

vi.mock("@/components/courses/CategoryHierarchy", () => ({
  CategoryHierarchy: ({
    courses,
    onUnfollow,
    onToggleAttendance,
    onToggleAttendanceMultiple,
  }: {
    courses: Array<{ id: string }>;
    onUnfollow?: (courseId: string) => void;
    onToggleAttendance?: (courseId: string) => void;
    onToggleAttendanceMultiple?: (courseIds: string[], shouldEnable: boolean) => void;
  }) => (
    <div
      data-testid="category-hierarchy"
      data-editable={onUnfollow ? "yes" : "no"}
      data-attendance={onToggleAttendance ? "yes" : "no"}
    >
      cursos:{courses.length}
      {onToggleAttendance && (
        <button type="button" onClick={() => onToggleAttendance("c-1")}>
          alternar frequencia
        </button>
      )}
      {onToggleAttendanceMultiple && (
        <button
          type="button"
          onClick={() => onToggleAttendanceMultiple(courses.map(({ id }) => id), true)}
        >
          ativar frequencia em lote
        </button>
      )}
    </div>
  ),
}));

describe("MyCourses page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ isEditMode: false });
    canMock.mockReturnValue(false);
    usePermissionsMock.mockReturnValue({ can: canMock });
    useAllCoursesDataMock.mockReturnValue({
      courses: [
        {
          id: "c-1",
          name: "Matematica Aplicada",
          short_name: "MAT",
          category: "Exatas",
          is_following: true,
          end_date: "2020-01-01T00:00:00.000Z",
          effective_end_date: "2099-01-01T00:00:00.000Z",
        },
        {
          id: "c-2",
          name: "Curso Encerrado",
          short_name: "OLD",
          category: "Legado",
          is_following: true,
          end_date: "2021-01-01T00:00:00.000Z",
        },
        {
          id: "c-3",
          name: "Nao seguido",
          short_name: "NO",
          category: "Teste",
          is_following: false,
          end_date: null,
        },
      ],
      isLoading: false,
      error: null,
      toggleFollow: vi.fn(),
      unfollowMultiple: vi.fn(),
      toggleAttendance: toggleAttendanceMock,
      toggleAttendanceMultiple: toggleAttendanceMultipleMock,
    });
  });

  it("shows loading indicator while data is loading", () => {
    useAllCoursesDataMock.mockReturnValue({
      courses: [],
      isLoading: true,
      error: null,
      toggleFollow: vi.fn(),
      unfollowMultiple: vi.fn(),
      toggleAttendance: toggleAttendanceMock,
      toggleAttendanceMultiple: toggleAttendanceMultipleMock,
    });

    const { container } = render(<MyCourses />);
    expect(container.querySelector('[data-testid="spinner"]')).toBeInTheDocument();
  });

  it("renders followed courses, including finished units", () => {
    render(<MyCourses />);

    expect(screen.getByText(/2 cursos em acompanhamento/i)).toBeInTheDocument();
    expect(screen.getByTestId("category-hierarchy")).toHaveTextContent("cursos:2");
    expect(screen.getByTestId("category-hierarchy")).toHaveAttribute("data-editable", "no");
    expect(screen.getByTestId("category-hierarchy")).toHaveAttribute("data-attendance", "no");
  });

  it("preserves edit callbacks but hides attendance actions without permission", () => {
    useAuthMock.mockReturnValue({ isEditMode: true });

    render(<MyCourses />);

    expect(screen.getByTestId("category-hierarchy")).toHaveAttribute("data-editable", "yes");
    expect(screen.getByTestId("category-hierarchy")).toHaveAttribute("data-attendance", "no");
    expect(screen.queryByRole("button", { name: /alternar frequencia/i })).not.toBeInTheDocument();
    expect(canMock).toHaveBeenCalledWith(APP_PERMISSIONS.COURSES_ATTENDANCE_MANAGE);
  });

  it("keeps attendance actions hidden outside edit mode even with permission", () => {
    canMock.mockReturnValue(true);

    render(<MyCourses />);

    expect(screen.getByTestId("category-hierarchy")).toHaveAttribute("data-attendance", "no");
    expect(screen.queryByRole("button", { name: /alternar frequencia/i })).not.toBeInTheDocument();
  });

  it("executes attendance actions when edit mode and permission are active", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({ isEditMode: true });
    canMock.mockReturnValue(true);

    render(<MyCourses />);

    await user.click(screen.getByRole("button", { name: /^alternar frequencia$/i }));
    await user.click(screen.getByRole("button", { name: /ativar frequencia em lote/i }));

    expect(toggleAttendanceMock).toHaveBeenCalledWith("c-1");
    expect(toggleAttendanceMultipleMock).toHaveBeenCalledWith(["c-1", "c-2"], true);
  });

  it("shows empty state when search has no matches", async () => {
    const user = userEvent.setup();
    render(<MyCourses />);

    await user.type(screen.getByPlaceholderText(/buscar curso/i), "inexistente");

    expect(screen.getByText(/nenhum curso em acompanhamento/i)).toBeInTheDocument();
  });
});
