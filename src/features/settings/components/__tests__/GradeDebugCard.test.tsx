import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GradeDebugCard } from "@/features/settings/components/GradeDebugCard";

const useMoodleSessionMock = vi.fn();
const fromMock = vi.fn();
const invokeMock = vi.fn();

const coursesSelectMock = vi.fn();
const coursesOrderMock = vi.fn();
const coursesEqMock = vi.fn();
const coursesSingleMock = vi.fn();

const studentCoursesSelectMock = vi.fn();
const studentCoursesEqMock = vi.fn();
const studentCoursesLimitMock = vi.fn();

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/modules/auth/context/MoodleSessionContext", () => ({
  useMoodleSession: () => useMoodleSessionMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

async function pickComboboxOption(index: number, optionName: RegExp) {
  const user = userEvent.setup();
  const combobox = screen.getAllByRole("combobox")[index];
  await user.click(combobox);
  await user.click(await screen.findByRole("option", { name: optionName }));
}

describe("GradeDebugCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useMoodleSessionMock.mockReturnValue({
      moodleUrl: "https://moodle.example.com",
      moodleToken: "token-123",
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "courses") {
        return { select: coursesSelectMock };
      }

      if (table === "student_courses") {
        return { select: studentCoursesSelectMock };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    coursesSelectMock.mockImplementation((query: string) => {
      if (query.includes("moodle_course_id") && query.includes("name")) {
        return { order: coursesOrderMock };
      }

      if (query === "id") {
        return { eq: coursesEqMock };
      }

      throw new Error(`Unexpected courses query: ${query}`);
    });
    coursesOrderMock.mockResolvedValue({
      data: [
        { id: "course-db-1", name: "Matematica", moodle_course_id: "101" },
        { id: "course-db-2", name: "Historia", moodle_course_id: "202" },
      ],
      error: null,
    });
    coursesEqMock.mockReturnValue({ single: coursesSingleMock });
    coursesSingleMock.mockResolvedValue({
      data: { id: "course-db-1" },
      error: null,
    });

    studentCoursesSelectMock.mockReturnValue({ eq: studentCoursesEqMock });
    studentCoursesEqMock.mockReturnValue({ limit: studentCoursesLimitMock });
    studentCoursesLimitMock.mockResolvedValue({
      data: [
        {
          students: {
            id: "student-db-1",
            full_name: "Ana Silva",
            moodle_user_id: "5001",
          },
        },
      ],
      error: null,
    });

    invokeMock.mockResolvedValue({
      data: { status: "ok", notes: [{ item: "Quiz", grade: 8.5 }] },
      error: null,
    });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("loads courses when opening and does not fetch again after data is cached", async () => {
    const user = userEvent.setup();
    render(<GradeDebugCard />);

    await user.click(screen.getByText(/Debug de Notas/i));
    await waitFor(() => {
      expect(coursesOrderMock).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: /Matematica/i }));

    await user.click(screen.getByText(/Debug de Notas/i));
    await user.click(screen.getByText(/Debug de Notas/i));
    expect(coursesOrderMock).toHaveBeenCalledTimes(1);
  });

  it("fetches debug data for selected course and student", async () => {
    const user = userEvent.setup();
    render(<GradeDebugCard />);

    await user.click(screen.getByText(/Debug de Notas/i));
    await pickComboboxOption(0, /Matematica/i);

    await waitFor(() => {
      expect(coursesEqMock).toHaveBeenCalledWith("moodle_course_id", "101");
      expect(studentCoursesEqMock).toHaveBeenCalledWith("course_id", "course-db-1");
    });

    await pickComboboxOption(1, /Ana Silva/i);
    await user.click(screen.getByRole("button", { name: /Buscar Notas/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("moodle-sync-grades", {
        body: {
          action: "debug_grades",
          moodleUrl: "https://moodle.example.com",
          token: "token-123",
          courseId: 101,
          userId: 5001,
        },
      });
    });

    expect(screen.getByText(/Resposta da API/i)).toBeInTheDocument();
    expect(screen.getByText(/"status": "ok"/i)).toBeInTheDocument();
  });

  it("shows an error message when invoke returns an error", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Falha na edge function" },
    });

    render(<GradeDebugCard />);

    await user.click(screen.getByText(/Debug de Notas/i));
    await pickComboboxOption(0, /Matematica/i);
    await pickComboboxOption(1, /Ana Silva/i);
    await user.click(screen.getByRole("button", { name: /Buscar Notas/i }));

    expect(await screen.findByText(/Falha na edge function/i)).toBeInTheDocument();
  });
});
