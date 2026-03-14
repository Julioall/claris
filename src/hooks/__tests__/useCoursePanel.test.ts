import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCoursePanel } from "@/hooks/useCoursePanel";

const fromMock = vi.fn();
const toastMock = vi.fn();

const coursesSelectMock = vi.fn();
const coursesEqMock = vi.fn();
const coursesSingleMock = vi.fn();

const studentCoursesSelectMock = vi.fn();
const studentCoursesEqMock = vi.fn();

const activitiesSelectMock = vi.fn();
const activitiesEqMock = vi.fn();
const activitiesNeqMock = vi.fn();
const activitiesOrderMock = vi.fn();

const activitiesUpdateMock = vi.fn();
const activitiesUpdateEqCourseMock = vi.fn();
const activitiesUpdateEqActivityMock = vi.fn();
const activitiesUpdateNeqMock = vi.fn();

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

function setupFromMock() {
  fromMock.mockImplementation((table: string) => {
    if (table === "courses") {
      return {
        select: coursesSelectMock,
      };
    }

    if (table === "student_courses") {
      return {
        select: studentCoursesSelectMock,
      };
    }

    if (table === "student_activities") {
      return {
        select: activitiesSelectMock,
        update: activitiesUpdateMock,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("useCoursePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    setupFromMock();

    coursesSelectMock.mockImplementation((query: string) => {
      if (query === "*") {
        return { eq: coursesEqMock };
      }

      return Promise.resolve({
        data: [
          {
            id: "c-1",
            category: "Senai > Escola A > Curso X > Turma 1",
            start_date: "2026-01-01T00:00:00.000Z",
            end_date: "2026-12-31T00:00:00.000Z",
          },
        ],
        error: null,
      });
    });
    coursesEqMock.mockReturnValue({ single: coursesSingleMock });
    coursesSingleMock.mockResolvedValue({
      data: {
        id: "c-1",
        name: "Matematica",
        short_name: "MAT",
        moodle_course_id: "10",
        category: "Senai > Escola A > Curso X > Turma 1",
        start_date: "2026-01-01T00:00:00.000Z",
        end_date: "2026-12-31T00:00:00.000Z",
      },
      error: null,
    });

    studentCoursesSelectMock.mockReturnValue({ eq: studentCoursesEqMock });
    studentCoursesEqMock.mockResolvedValue({
      data: [
        {
          student_id: "s-1",
          enrollment_status: "ativo",
          last_access: "2026-02-20T00:00:00.000Z",
          students: {
            id: "s-1",
            moodle_user_id: "11",
            full_name: "Ana",
            current_risk_level: "risco",
            created_at: "2026-02-01T00:00:00.000Z",
            updated_at: "2026-02-01T00:00:00.000Z",
          },
        },
        {
          student_id: "s-2",
          enrollment_status: "ativo",
          last_access: null,
          students: {
            id: "s-2",
            moodle_user_id: "12",
            full_name: "Bruno",
            current_risk_level: "normal",
            created_at: "2026-02-01T00:00:00.000Z",
            updated_at: "2026-02-01T00:00:00.000Z",
          },
        },
        {
          student_id: "s-3",
          enrollment_status: "suspenso",
          last_access: null,
          students: {
            id: "s-3",
            moodle_user_id: "13",
            full_name: "Carla",
            current_risk_level: "critico",
            created_at: "2026-02-01T00:00:00.000Z",
            updated_at: "2026-02-01T00:00:00.000Z",
          },
        },
      ],
      error: null,
    });

    activitiesSelectMock.mockReturnValue({ eq: activitiesEqMock });
    activitiesEqMock.mockReturnValue({ neq: activitiesNeqMock });
    activitiesNeqMock.mockReturnValue({ order: activitiesOrderMock });
    activitiesOrderMock.mockResolvedValue({
      data: [
        {
          id: "a-1",
          student_id: "s-1",
          course_id: "c-1",
          moodle_activity_id: "m-1",
          activity_name: "Atividade 1",
          activity_type: "quiz",
          grade: 8,
          grade_max: 10,
          percentage: 80,
          status: "completed",
          completed_at: "2026-02-20T00:00:00.000Z",
          due_date: "2026-02-21T00:00:00.000Z",
          hidden: false,
        },
        {
          id: "a-2",
          student_id: "s-2",
          course_id: "c-1",
          moodle_activity_id: "m-1",
          activity_name: "Atividade 1",
          activity_type: "quiz",
          grade: null,
          grade_max: 10,
          percentage: null,
          status: "pending",
          completed_at: null,
          due_date: "2026-02-21T00:00:00.000Z",
          hidden: false,
        },
        {
          id: "a-3",
          student_id: "s-1",
          course_id: "c-1",
          moodle_activity_id: "m-2",
          activity_name: "Atividade 2",
          activity_type: "forum",
          grade: 10,
          grade_max: 10,
          percentage: 100,
          status: "completed",
          completed_at: "2026-02-20T00:00:00.000Z",
          due_date: "2026-02-21T00:00:00.000Z",
          hidden: true,
        },
        {
          id: "a-4",
          student_id: "s-2",
          course_id: "c-1",
          moodle_activity_id: "m-3",
          activity_name: "Atividade 3",
          activity_type: "assignment",
          grade: 7,
          grade_max: 10,
          percentage: 70,
          status: "completed",
          completed_at: "2026-02-20T00:00:00.000Z",
          due_date: "2026-02-21T00:00:00.000Z",
          hidden: false,
        },
      ],
      error: null,
    });

    activitiesUpdateMock.mockReturnValue({ eq: activitiesUpdateEqCourseMock });
    activitiesUpdateEqCourseMock.mockReturnValue({ eq: activitiesUpdateEqActivityMock });
    activitiesUpdateEqActivityMock.mockReturnValue({ neq: activitiesUpdateNeqMock });
    activitiesUpdateNeqMock.mockResolvedValue({ error: null });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("loads course, students, activities and computes stats", async () => {
    const { result } = renderHook(() => useCoursePanel("c-1"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.course).toMatchObject({ id: "c-1", short_name: "MAT" });
    expect(result.current.students).toHaveLength(2);
    expect(result.current.activities).toHaveLength(3);
    expect(result.current.stats).toEqual({
      totalStudents: 2,
      atRiskStudents: 1,
      totalActivities: 2,
      completionRate: 67,
      riskDistribution: {
        normal: 1,
        atencao: 0,
        risco: 1,
        critico: 0,
      },
    });
  });

  it("returns validation error when course id is not provided", async () => {
    const { result } = renderHook(() => useCoursePanel(undefined));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toContain("não fornecido");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("handles fetch failures", async () => {
    coursesSingleMock.mockResolvedValueOnce({
      data: null,
      error: new Error("course failed"),
    });

    const { result } = renderHook(() => useCoursePanel("c-1"));

    await waitFor(() => {
      expect(result.current.error).toContain("course failed");
    });
  });

  it("toggles activity visibility, emits toast and refetches", async () => {
    const { result } = renderHook(() => useCoursePanel("c-1"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggleActivityVisibility("m-1", true);
    });

    expect(activitiesUpdateMock).toHaveBeenCalledWith({ hidden: true });
    expect(activitiesUpdateEqCourseMock).toHaveBeenCalledWith("course_id", "c-1");
    expect(activitiesUpdateEqActivityMock).toHaveBeenCalledWith("moodle_activity_id", "m-1");
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/oculta/i),
      }),
    );
    expect(coursesSelectMock).toHaveBeenCalledTimes(4);
  });

  it("shows destructive toast when visibility update fails", async () => {
    activitiesUpdateEqActivityMock.mockResolvedValueOnce({ error: new Error("update failed") });

    const { result } = renderHook(() => useCoursePanel("c-1"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggleActivityVisibility("m-1", false);
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Erro",
        variant: "destructive",
      }),
    );
  });
});
