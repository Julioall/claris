import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Schools from "@/features/courses/pages/SchoolsPage";
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

vi.mock("@/components/schools/SchoolHierarchy", () => ({
  SchoolHierarchy: ({
    courses,
    onToggleFollow,
    onToggleIgnore,
    onToggleAttendance,
    onToggleAttendanceMultiple,
  }: {
    courses: Array<{ id: string }>;
    onToggleFollow?: (courseId: string) => void;
    onToggleIgnore?: (courseId: string) => void;
    onToggleAttendance?: (courseId: string) => void;
    onToggleAttendanceMultiple?: (courseIds: string[], shouldEnable: boolean) => void;
  }) => (
    <div
      data-testid="school-hierarchy"
      data-editable={onToggleFollow ? "yes" : "no"}
      data-ignore={onToggleIgnore ? "yes" : "no"}
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

describe("Schools page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ isEditMode: false });
    canMock.mockReturnValue(false);
    usePermissionsMock.mockReturnValue({ can: canMock });
    useAllCoursesDataMock.mockReturnValue({
      courses: [
        {
          id: "c-1",
          name: "Fisica",
          short_name: "FIS",
          category: "Exatas",
          is_following: true,
        },
        {
          id: "c-2",
          name: "Historia",
          short_name: "HIS",
          category: "Humanas",
          is_following: true,
        },
      ],
      isLoading: false,
      error: null,
      toggleFollow: vi.fn(),
      toggleIgnore: vi.fn(),
      toggleIgnoreMultiple: vi.fn(),
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
      toggleIgnore: vi.fn(),
      toggleIgnoreMultiple: vi.fn(),
      toggleAttendance: toggleAttendanceMock,
      toggleAttendanceMultiple: toggleAttendanceMultipleMock,
    });

    const { container } = render(<Schools />);
    expect(container.querySelector('[data-testid="spinner"]')).toBeInTheDocument();
  });

  it("renders school hierarchy and total count", () => {
    render(<Schools />);

    expect(screen.getByText(/cursos sincronizados/i)).toBeInTheDocument();
    expect(screen.getByTestId("school-hierarchy")).toHaveTextContent("cursos:2");
    expect(screen.getByTestId("school-hierarchy")).toHaveAttribute("data-editable", "no");
    expect(screen.getByTestId("school-hierarchy")).toHaveAttribute("data-attendance", "no");
  });

  it("preserves follow and ignore callbacks but hides attendance without permission", () => {
    useAuthMock.mockReturnValue({ isEditMode: true });

    render(<Schools />);

    expect(screen.getByTestId("school-hierarchy")).toHaveAttribute("data-editable", "yes");
    expect(screen.getByTestId("school-hierarchy")).toHaveAttribute("data-ignore", "yes");
    expect(screen.getByTestId("school-hierarchy")).toHaveAttribute("data-attendance", "no");
    expect(screen.queryByRole("button", { name: /alternar frequencia/i })).not.toBeInTheDocument();
    expect(canMock).toHaveBeenCalledWith(APP_PERMISSIONS.COURSES_ATTENDANCE_MANAGE);
  });

  it("keeps attendance actions hidden outside edit mode even with permission", () => {
    canMock.mockReturnValue(true);

    render(<Schools />);

    expect(screen.getByTestId("school-hierarchy")).toHaveAttribute("data-attendance", "no");
    expect(screen.queryByRole("button", { name: /alternar frequencia/i })).not.toBeInTheDocument();
  });

  it("executes attendance actions when edit mode and permission are active", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({ isEditMode: true });
    canMock.mockReturnValue(true);

    render(<Schools />);

    await user.click(screen.getByRole("button", { name: /^alternar frequencia$/i }));
    await user.click(screen.getByRole("button", { name: /ativar frequencia em lote/i }));

    expect(toggleAttendanceMock).toHaveBeenCalledWith("c-1");
    expect(toggleAttendanceMultipleMock).toHaveBeenCalledWith(["c-1", "c-2"], true);
  });

  it("shows empty state when search returns no matches", async () => {
    const user = userEvent.setup();
    render(<Schools />);

    await user.type(
      screen.getByPlaceholderText(/buscar escola, curso ou disciplina/i),
      "inexistente",
    );

    expect(screen.getByText(/nenhum curso encontrado/i)).toBeInTheDocument();
  });
});
