import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useStudentsData } from "@/hooks/useStudentsData";

const useAuthMock = vi.fn();
const fromMock = vi.fn();

const userCoursesSelectMock = vi.fn();
const userCoursesEqUserMock = vi.fn();
const userCoursesEqRoleMock = vi.fn();

const studentCoursesSelectMock = vi.fn();
const studentCoursesInMock = vi.fn();

const pendingTasksSelectMock = vi.fn();
const pendingTasksEqMock = vi.fn();

const actionsSelectMock = vi.fn();
const actionsEqMock = vi.fn();

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

const pendingCountByStudent: Record<string, number> = {
  "s-1": 2,
  "s-2": 5,
  "s-3": 0,
};

const lastActionByStudent: Record<string, { completed_at?: string; created_at?: string } | null> = {
  "s-1": { completed_at: "2026-02-20T10:00:00.000Z", created_at: "2026-02-19T10:00:00.000Z" },
  "s-2": { completed_at: null, created_at: "2026-02-18T10:00:00.000Z" },
  "s-3": null,
};

function setupFromMock() {
  fromMock.mockImplementation((table: string) => {
    if (table === "user_courses") {
      return {
        select: userCoursesSelectMock,
      };
    }

    if (table === "student_courses") {
      return {
        select: studentCoursesSelectMock,
      };
    }

    if (table === "pending_tasks") {
      return {
        select: pendingTasksSelectMock,
      };
    }

    if (table === "actions") {
      return {
        select: actionsSelectMock,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("useStudentsData", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: "user-1" } });

    setupFromMock();

    userCoursesSelectMock.mockReturnValue({ eq: userCoursesEqUserMock });
    userCoursesEqUserMock.mockReturnValue({ eq: userCoursesEqRoleMock });
    userCoursesEqRoleMock.mockResolvedValue({
      data: [{ course_id: "c-1" }, { course_id: "c-2" }],
      error: null,
    });

    studentCoursesSelectMock.mockReturnValue({ in: studentCoursesInMock });
    studentCoursesInMock.mockResolvedValue({
      data: [
        {
          student_id: "s-1",
          enrollment_status: "ativo",
          courses: {
            start_date: "2026-01-01T00:00:00.000Z",
          },
          students: {
            id: "s-1",
            moodle_user_id: "10",
            full_name: "Ana",
            current_risk_level: "atencao",
            created_at: "2026-02-01T00:00:00.000Z",
            updated_at: "2026-02-01T00:00:00.000Z",
          },
        },
        {
          student_id: "s-1",
          enrollment_status: "suspenso",
          courses: {
            start_date: "2026-01-01T00:00:00.000Z",
          },
          students: {
            id: "s-1",
            moodle_user_id: "10",
            full_name: "Ana",
            current_risk_level: "atencao",
            created_at: "2026-02-01T00:00:00.000Z",
            updated_at: "2026-02-01T00:00:00.000Z",
          },
        },
        {
          student_id: "s-2",
          enrollment_status: "suspenso",
          courses: {
            start_date: "2026-01-01T00:00:00.000Z",
          },
          students: {
            id: "s-2",
            moodle_user_id: "11",
            full_name: "Bruno",
            current_risk_level: "critico",
            created_at: "2026-02-01T00:00:00.000Z",
            updated_at: "2026-02-01T00:00:00.000Z",
          },
        },
        {
          student_id: "s-3",
          enrollment_status: "concluido",
          courses: {
            start_date: "2026-01-01T00:00:00.000Z",
          },
          students: {
            id: "s-3",
            moodle_user_id: "12",
            full_name: "Carla",
            current_risk_level: "normal",
            created_at: "2026-02-01T00:00:00.000Z",
            updated_at: "2026-02-01T00:00:00.000Z",
          },
        },
      ],
      error: null,
    });

    pendingTasksSelectMock.mockReturnValue({
      eq: (column: string, value: string) => {
        if (column !== "student_id") {
          throw new Error(`Unexpected column on pending_tasks.eq: ${column}`);
        }
        return {
          neq: vi.fn().mockResolvedValue({
            count: pendingCountByStudent[value] ?? 0,
            error: null,
          }),
        };
      },
    });

    actionsSelectMock.mockReturnValue({
      eq: (column: string, value: string) => {
        if (column !== "student_id") {
          throw new Error(`Unexpected column on actions.eq: ${column}`);
        }
        return {
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: lastActionByStudent[value],
                error: null,
              }),
            }),
          }),
        };
      },
    });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("deduplicates students, computes stats and sorts by risk level", async () => {
    const { result } = renderHook(() => useStudentsData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.students).toHaveLength(3);

    expect(result.current.students[0]).toMatchObject({
      id: "s-2",
      current_risk_level: "critico",
      enrollment_status: "suspenso",
      pending_tasks_count: 5,
      last_action_date: "2026-02-18T10:00:00.000Z",
    });
    expect(result.current.students[1]).toMatchObject({
      id: "s-1",
      current_risk_level: "atencao",
      enrollment_status: "suspenso",
      pending_tasks_count: 2,
      last_action_date: "2026-02-20T10:00:00.000Z",
    });
    expect(result.current.students[2]).toMatchObject({
      id: "s-3",
      current_risk_level: "normal",
      enrollment_status: "concluido",
      pending_tasks_count: 0,
      last_action_date: undefined,
    });
  });

  it("returns empty data when user is not authenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });

    const { result } = renderHook(() => useStudentsData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.students).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("stores an error when loading student courses fails", async () => {
    studentCoursesInMock.mockResolvedValueOnce({
      data: null,
      error: new Error("students query failed"),
    });

    const { result } = renderHook(() => useStudentsData());

    await waitFor(() => {
      expect(result.current.error).toContain("students query failed");
    });
  });

  it("applies explicit course filter when provided", async () => {
    const { result } = renderHook(() => useStudentsData("course-fixed"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(studentCoursesInMock).toHaveBeenCalledWith("course_id", ["course-fixed"]);
  });
});
