import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SchoolCourseCard } from "@/components/schools/SchoolCourseCard";

const toastSuccessMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

const baseCourse = {
  id: "school-c-1",
  name: "Curso da Escola",
  students_count: 18,
  at_risk_count: 2,
  pending_tasks_count: 4,
  is_following: false,
  is_ignored: false,
  is_attendance_enabled: false,
  end_date: "2099-01-01T00:00:00.000Z",
};

describe("SchoolCourseCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders course info and detail link", () => {
    render(
      <MemoryRouter>
        <SchoolCourseCard course={baseCourse} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Curso da Escola")).toBeInTheDocument();
    expect(screen.getByText(/em andamento/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /curso da escola/i })).toHaveAttribute(
      "href",
      "/cursos/school-c-1",
    );
  });

  it("calls edit-mode actions and emits toasts", async () => {
    const user = userEvent.setup();
    const onToggleFollow = vi.fn();
    const onToggleIgnore = vi.fn();
    const onToggleAttendance = vi.fn();
    render(
      <MemoryRouter>
        <SchoolCourseCard
          course={baseCourse}
          onToggleFollow={onToggleFollow}
          onToggleIgnore={onToggleIgnore}
          onToggleAttendance={onToggleAttendance}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByTitle(/ignorar na sincroniza/i));
    await user.click(screen.getByTitle(/adicionar aos meus cursos/i));
    await user.click(screen.getByTitle(/ativar controle de presenca/i));

    expect(onToggleIgnore).toHaveBeenCalledWith("school-c-1");
    expect(onToggleFollow).toHaveBeenCalledWith("school-c-1");
    expect(onToggleAttendance).toHaveBeenCalledWith("school-c-1");
    expect(toastSuccessMock).toHaveBeenCalledTimes(3);
  });

  it("renders status badges for ignored and attendance-enabled courses", () => {
    render(
      <MemoryRouter>
        <SchoolCourseCard
          course={{
            ...baseCourse,
            is_ignored: true,
            is_attendance_enabled: true,
            end_date: "2020-01-01T00:00:00.000Z",
            effective_end_date: "2020-03-15T12:00:00.000Z",
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/ignorado/i)).toBeInTheDocument();
    expect(screen.getByText(/presenca/i)).toBeInTheDocument();
    expect(screen.getByText(/finalizada/i)).toBeInTheDocument();
    expect(screen.getByText(/encerrado em/i)).toBeInTheDocument();
    expect(screen.getByText(/15\/03\/2020/i)).toBeInTheDocument();
  });
});
