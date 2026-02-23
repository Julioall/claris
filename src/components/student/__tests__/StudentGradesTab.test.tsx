import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentGradesTab } from "@/components/student/StudentGradesTab";

const fromMock = vi.fn();
const gradesEqMock = vi.fn();
const activitiesEqMock = vi.fn();
const activitiesOrderMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

describe("StudentGradesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    gradesEqMock.mockResolvedValue({ data: [], error: null });
    activitiesOrderMock.mockResolvedValue({ data: [], error: null });
    activitiesEqMock.mockReturnValue({ order: activitiesOrderMock });

    fromMock.mockImplementation((table: string) => {
      if (table === "student_course_grades") {
        return {
          select: () => ({ eq: gradesEqMock }),
        };
      }

      if (table === "student_activities") {
        return {
          select: () => ({ eq: activitiesEqMock }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("shows empty state when student has no grades", async () => {
    render(<StudentGradesTab studentId="s-1" />);

    expect(document.querySelector(".animate-spin")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/nenhuma nota encontrada/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/após a sincronização dos cursos/i)).toBeInTheDocument();
  });

  it("renders normalized course total using visible activities only", async () => {
    const user = userEvent.setup();

    gradesEqMock.mockResolvedValueOnce({
      data: [
        {
          id: "g-1",
          course_id: "c-1",
          grade_raw: 18,
          grade_max: 20,
          grade_percentage: 90,
          grade_formatted: "18/20",
          letter_grade: "A",
          last_sync: "2026-02-23T00:00:00.000Z",
          courses: { name: "Matematica" },
        },
      ],
      error: null,
    });

    activitiesOrderMock.mockResolvedValueOnce({
      data: [
        {
          id: "a-1",
          course_id: "c-1",
          activity_name: "Trabalho 1",
          activity_type: "assignment",
          grade: 7,
          grade_max: 10,
          percentage: 70,
          status: "graded",
          due_date: null,
          hidden: false,
        },
        {
          id: "a-2",
          course_id: "c-1",
          activity_name: "Prova 1",
          activity_type: "quiz",
          grade: 8,
          grade_max: 10,
          percentage: 80,
          status: "graded",
          due_date: null,
          hidden: false,
        },
        {
          id: "a-3",
          course_id: "c-1",
          activity_name: "Atividade Oculta",
          activity_type: "quiz",
          grade: 10,
          grade_max: 10,
          percentage: 100,
          status: "graded",
          due_date: null,
          hidden: true,
        },
      ],
      error: null,
    });

    render(<StudentGradesTab studentId="s-1" />);

    await waitFor(() => {
      expect(screen.getByText("Matematica")).toBeInTheDocument();
    });

    expect(screen.getByText("75.0")).toBeInTheDocument();
    expect(screen.getByText("75.0 / 100")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /atividades e notas separadas/i }));

    expect(screen.getByText("Trabalho 1")).toBeInTheDocument();
    expect(screen.getByText("Prova 1")).toBeInTheDocument();
    expect(screen.queryByText("Atividade Oculta")).not.toBeInTheDocument();
  });

  it("falls back to empty state when fetch fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    gradesEqMock.mockResolvedValueOnce({ data: null, error: { message: "db fail" } });

    render(<StudentGradesTab studentId="s-1" />);

    await waitFor(() => {
      expect(screen.getByText(/nenhuma nota encontrada/i)).toBeInTheDocument();
    });
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
