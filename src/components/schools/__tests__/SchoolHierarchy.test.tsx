import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SchoolHierarchy } from "@/components/schools/SchoolHierarchy";

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
      <span
        role="button"
        tabIndex={0}
        onClick={() => onToggleAttendanceMultiple(courses.map((course) => course.id), true)}
        onKeyDown={() => {}}
      >
        {`bulk-${level}-${courses.length}`}
      </span>
    );
  },
}));

vi.mock("@/components/schools/SchoolCourseCard", () => ({
  SchoolCourseCard: ({
    course,
    onToggleFollow,
    onToggleIgnore,
    onToggleAttendance,
  }: {
    course: { id: string; name: string };
    onToggleFollow?: (courseId: string) => void;
    onToggleIgnore?: (courseId: string) => void;
    onToggleAttendance?: (courseId: string) => void;
  }) => (
    <div>
      <span>{course.name}</span>
      <button type="button" onClick={() => onToggleFollow?.(course.id)}>{`follow-${course.id}`}</button>
      <button type="button" onClick={() => onToggleIgnore?.(course.id)}>{`ignore-${course.id}`}</button>
      <button type="button" onClick={() => onToggleAttendance?.(course.id)}>{`attendance-${course.id}`}</button>
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
    is_following: true,
    is_ignored: false,
    is_attendance_enabled: false,
  },
  {
    id: "d2",
    name: "Disciplina 2",
    category: "Senai > Escola A > Curso X > Turma 1",
    students_count: 3,
    at_risk_count: 0,
    is_following: false,
    is_ignored: true,
    is_attendance_enabled: true,
  },
  {
    id: "d3",
    name: "Disciplina 3",
    category: "Senai > Escola A > Curso X > Turma 2",
    students_count: 1,
    at_risk_count: 1,
    is_following: false,
    is_ignored: false,
    is_attendance_enabled: false,
  },
];

describe("SchoolHierarchy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when there are no categorized or uncategorized courses", () => {
    const { container } = render(<SchoolHierarchy courses={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it("renders grouped hierarchy labels and aggregated stats", async () => {
    const user = userEvent.setup();
    render(<SchoolHierarchy courses={courses} />);

    expect(screen.getByText("Escola A")).toBeInTheDocument();
    expect(screen.getByText("1 curso")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /escola a/i }));
    expect(screen.getByText("Curso X")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /curso x/i }));
    expect(screen.getByText("Turma 1")).toBeInTheDocument();
    expect(screen.getByText(/2 disciplinas/i)).toBeInTheDocument();

    expect(screen.getAllByText("★ 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("6").length).toBeGreaterThan(0);
  });

  it("calls bulk attendance and bulk ignore handlers", async () => {
    const user = userEvent.setup();
    const onToggleAttendanceMultiple = vi.fn();
    const onToggleIgnoreMultiple = vi.fn();

    render(
      <SchoolHierarchy
        courses={courses}
        onToggleAttendanceMultiple={onToggleAttendanceMultiple}
        onToggleIgnoreMultiple={onToggleIgnoreMultiple}
      />,
    );

    await user.click(screen.getByRole("button", { name: "bulk-escola-3" }));
    expect(onToggleAttendanceMultiple).toHaveBeenCalledWith(["d1", "d2", "d3"], true);

    const ignoreAllButtons = screen.getAllByRole("button", { name: /ignorar/i });
    for (const button of ignoreAllButtons) {
      await user.click(button);
    }

    const calledWithAllCourses = onToggleIgnoreMultiple.mock.calls.some(
      (call) => JSON.stringify(call[0]) === JSON.stringify(["d1", "d2", "d3"]),
    );

    const showedIgnoreToast = toastSuccessMock.mock.calls.some(
      (call) => typeof call[0] === "string" && call[0].includes("Escola marcada como ignorada"),
    );

    expect(calledWithAllCourses).toBe(true);
    expect(showedIgnoreToast).toBe(true);
  });

  it("propagates card-level follow/ignore/attendance callbacks", () => {
    const onToggleFollow = vi.fn();
    const onToggleIgnore = vi.fn();
    const onToggleAttendance = vi.fn();

    const uncategorizedCourses = [
      {
        id: "uc-1",
        name: "Curso Sem Categoria",
        students_count: 2,
        at_risk_count: 0,
        is_following: false,
        is_ignored: false,
        is_attendance_enabled: false,
      },
    ];

    render(
      <SchoolHierarchy
        courses={uncategorizedCourses}
        onToggleFollow={onToggleFollow}
        onToggleIgnore={onToggleIgnore}
        onToggleAttendance={onToggleAttendance}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /sem categoria/i }));

    fireEvent.click(screen.getByRole("button", { name: "follow-uc-1" }));
    fireEvent.click(screen.getByRole("button", { name: "ignore-uc-1" }));
    fireEvent.click(screen.getByRole("button", { name: "attendance-uc-1" }));

    expect(onToggleFollow).toHaveBeenCalledWith("uc-1");
    expect(onToggleIgnore).toHaveBeenCalledWith("uc-1");
    expect(onToggleAttendance).toHaveBeenCalledWith("uc-1");
  });
});
