import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryHierarchy } from "@/components/courses/CategoryHierarchy";

const toastSuccessMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

vi.mock("@/components/attendance/AttendanceBulkToggleButton", () => ({
  AttendanceBulkToggleButton: ({
    courses,
    level,
    onToggleAttendanceMultiple,
  }: {
    courses: Array<{ id: string }>;
    level: string;
    onToggleAttendanceMultiple?: (courseIds: string[], shouldEnable: boolean) => void;
  }) => {
    if (!onToggleAttendanceMultiple) return null;

    return (
      <button
        type="button"
        onClick={() => onToggleAttendanceMultiple(courses.map((course) => course.id), true)}
      >
        {`bulk-${level}-${courses.length}`}
      </button>
    );
  },
}));

vi.mock("@/components/courses/MyCourseCard", () => ({
  MyCourseCard: ({
    course,
    onUnfollow,
    onToggleAttendance,
  }: {
    course: { id: string; name: string };
    onUnfollow?: (courseId: string) => void;
    onToggleAttendance?: (courseId: string) => void;
  }) => (
    <div>
      <span>{course.name}</span>
      <button type="button" onClick={() => onUnfollow?.(course.id)}>{`unfollow-${course.id}`}</button>
      <button type="button" onClick={() => onToggleAttendance?.(course.id)}>{`toggle-${course.id}`}</button>
    </div>
  ),
}));

const courses = [
  {
    id: "d1",
    name: "Disciplina 1",
    category: "Senai > Escola A > Curso X > Turma 1",
    students_count: 2,
    at_risk_count: 1,
    pending_tasks_count: 2,
    student_ids: ["s1", "s2"],
    is_attendance_enabled: false,
  },
  {
    id: "d2",
    name: "Disciplina 2",
    category: "Senai > Escola A > Curso X > Turma 1",
    students_count: 2,
    at_risk_count: 0,
    pending_tasks_count: 1,
    student_ids: ["s2", "s3"],
    is_attendance_enabled: true,
  },
  {
    id: "d3",
    name: "Disciplina 3",
    category: "Senai > Escola A > Curso X > Turma 2",
    students_count: 1,
    at_risk_count: 1,
    pending_tasks_count: 0,
    student_ids: ["s4"],
    is_attendance_enabled: false,
  },
];

describe("CategoryHierarchy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when there are no categorized or uncategorized courses", () => {
    const { container } = render(<CategoryHierarchy courses={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it("renders grouped school/course/class labels and deduplicated stats", async () => {
    const user = userEvent.setup();
    render(<CategoryHierarchy courses={courses} />);

    expect(screen.getByText("Escola A")).toBeInTheDocument();
    expect(screen.getByText("1 curso")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /escola a/i }));
    expect(screen.getByText("Curso X")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /curso x/i }));
    expect(screen.getByText("Turma 1")).toBeInTheDocument();
    expect(screen.getByText(/2 disciplinas/i)).toBeInTheDocument();

    // Escola A possui estudantes únicos s1,s2,s3,s4 => 4
    expect(screen.getAllByText("4").length).toBeGreaterThan(0);
  });

  it("calls bulk handlers and remove-all with expected course ids", async () => {
    const user = userEvent.setup();
    const onUnfollowMultiple = vi.fn();
    const onToggleAttendanceMultiple = vi.fn();

    render(
      <CategoryHierarchy
        courses={courses}
        onUnfollowMultiple={onUnfollowMultiple}
        onToggleAttendanceMultiple={onToggleAttendanceMultiple}
      />,
    );

    await user.click(screen.getByRole("button", { name: "bulk-escola-3" }));
    expect(onToggleAttendanceMultiple).toHaveBeenCalledWith(["d1", "d2", "d3"], true);

    const removeAllButtons = screen.getAllByRole("button", { name: /remover todos/i });
    for (const button of removeAllButtons) {
      await user.click(button);
    }

    const calledWithAllCourses = onUnfollowMultiple.mock.calls.some(
      (call) => JSON.stringify(call[0]) === JSON.stringify(["d1", "d2", "d3"]),
    );

    const showedSuccessToastForAllCourses = toastSuccessMock.mock.calls.some(
      (call) => call[0] === "3 cursos removidos de Meus Cursos",
    );

    expect(calledWithAllCourses).toBe(true);
    expect(showedSuccessToastForAllCourses).toBe(true);
  });

  it("propagates card-level unfollow and attendance callbacks", async () => {
    const user = userEvent.setup();
    const onUnfollow = vi.fn();
    const onToggleAttendance = vi.fn();

    render(
      <CategoryHierarchy
        courses={courses}
        onUnfollow={onUnfollow}
        onToggleAttendance={onToggleAttendance}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /escola a/i }));
    fireEvent.click(screen.getByRole("button", { name: /curso x/i }));
    fireEvent.click(screen.getByRole("button", { name: /turma 1/i }));

    await user.click(screen.getByRole("button", { name: "unfollow-d1" }));
    await user.click(screen.getByRole("button", { name: "toggle-d1" }));

    expect(onUnfollow).toHaveBeenCalledWith("d1");
    expect(onToggleAttendance).toHaveBeenCalledWith("d1");
  }, 15000);
});
