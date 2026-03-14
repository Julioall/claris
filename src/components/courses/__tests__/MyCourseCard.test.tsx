import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MyCourseCard } from "@/components/courses/MyCourseCard";

const toastSuccessMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

const baseCourse = {
  id: "c-1",
  name: "Curso em acompanhamento",
  students_count: 20,
  at_risk_count: 3,
  pending_tasks_count: 5,
  start_date: "2000-01-01T00:00:00.000Z",
  end_date: "2099-12-01T00:00:00.000Z",
  last_sync: "2026-02-20T10:00:00.000Z",
  is_attendance_enabled: false,
};

describe("MyCourseCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders card content with course link", () => {
    render(
      <MemoryRouter>
        <MyCourseCard course={baseCourse} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Curso em acompanhamento")).toBeInTheDocument();
    expect(screen.getByText(/em andamento/i)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/cursos/c-1");
  });

  it("triggers unfollow callback and success toast", async () => {
    const user = userEvent.setup();
    const onUnfollow = vi.fn();
    render(
      <MemoryRouter>
        <MyCourseCard course={baseCourse} onUnfollow={onUnfollow} />
      </MemoryRouter>,
    );

    await user.click(screen.getByTitle(/remover de meus cursos/i));

    expect(onUnfollow).toHaveBeenCalledWith("c-1");
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("toggles attendance callback and toast message", async () => {
    const user = userEvent.setup();
    const onToggleAttendance = vi.fn();
    render(
      <MemoryRouter>
        <MyCourseCard
          course={{ ...baseCourse, is_attendance_enabled: false }}
          onToggleAttendance={onToggleAttendance}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByTitle(/ativar presenca/i));

    expect(onToggleAttendance).toHaveBeenCalledWith("c-1");
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("shows finalized status for finished units", () => {
    render(
      <MemoryRouter>
        <MyCourseCard
          course={{
            ...baseCourse,
            id: "c-2",
            name: "Curso finalizado",
            end_date: "2020-01-01T00:00:00.000Z",
            effective_end_date: "2020-03-15T00:00:00.000Z",
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/finalizada/i)).toBeInTheDocument();
    expect(screen.getByText(/fim:/i)).toBeInTheDocument();
    expect(screen.getByText(/14\/03\/2020|15\/03\/2020/i)).toBeInTheDocument();
  });
});
