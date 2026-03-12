import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAllCoursesData } from "@/hooks/useAllCoursesData";

const useAuthMock = vi.fn();
const fromMock = vi.fn();

const userCoursesSelectMock = vi.fn();
const userCoursesSelectEqMock = vi.fn();

const userCoursesDeleteMock = vi.fn();
const userCoursesDeleteEqUserMock = vi.fn();
const userCoursesDeleteEqCourseMock = vi.fn();
const userCoursesDeleteInMock = vi.fn();

const userCoursesInsertMock = vi.fn();

const coursesSelectMock = vi.fn();
const coursesOrderMock = vi.fn();

const ignoredSelectMock = vi.fn();
const ignoredEqMock = vi.fn();

const ignoredDeleteMock = vi.fn();
const ignoredDeleteEqUserMock = vi.fn();
const ignoredDeleteEqCourseMock = vi.fn();
const ignoredDeleteInMock = vi.fn();

const ignoredInsertMock = vi.fn();

const attendanceSelectMock = vi.fn();
const attendanceEqMock = vi.fn();

const attendanceDeleteMock = vi.fn();
const attendanceDeleteEqUserMock = vi.fn();
const attendanceDeleteEqCourseMock = vi.fn();
const attendanceDeleteInMock = vi.fn();

const attendanceInsertMock = vi.fn();

const studentCoursesSelectMock = vi.fn();
const studentCoursesEqMock = vi.fn();

const pendingSelectMock = vi.fn();
const pendingEqMock = vi.fn();
const pendingNeqMock = vi.fn();

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

const studentIdsByCourse: Record<string, string[]> = {
  "c-1": ["s-1", "s-2", "s-3"],
  "c-2": ["s-4"],
};

const atRiskByCourse: Record<string, Array<{ students: { current_risk_level: string } | null }>> = {
  "c-1": [
    { students: { current_risk_level: "risco" } },
    { students: { current_risk_level: "normal" } },
    { students: { current_risk_level: "critico" } },
  ],
  "c-2": [{ students: { current_risk_level: "normal" } }],
};

const pendingCountByCourse: Record<string, number> = {
  "c-1": 5,
  "c-2": 1,
};

function setupFromMock() {
  fromMock.mockImplementation((table: string) => {
    if (table === "user_courses") {
      return {
        select: userCoursesSelectMock,
        delete: userCoursesDeleteMock,
        insert: userCoursesInsertMock,
      };
    }

    if (table === "courses") {
      return {
        select: coursesSelectMock,
      };
    }

    if (table === "user_ignored_courses") {
      return {
        select: ignoredSelectMock,
        delete: ignoredDeleteMock,
        insert: ignoredInsertMock,
      };
    }

    if (table === "attendance_course_settings") {
      return {
        select: attendanceSelectMock,
        delete: attendanceDeleteMock,
        insert: attendanceInsertMock,
      };
    }

    if (table === "student_courses") {
      return {
        select: studentCoursesSelectMock,
      };
    }

    if (table === "pending_tasks") {
      return {
        select: pendingSelectMock,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("useAllCoursesData", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: "user-1" } });

    setupFromMock();

    userCoursesSelectMock.mockReturnValue({ eq: userCoursesSelectEqMock });
    userCoursesSelectEqMock.mockResolvedValue({
      data: [
        { course_id: "c-1", role: "tutor" },
        { course_id: "c-2", role: "viewer" },
      ],
      error: null,
    });

    coursesSelectMock.mockReturnValue({ order: coursesOrderMock });
    coursesOrderMock.mockResolvedValue({
      data: [
        {
          id: "c-1",
          moodle_course_id: "10",
          name: "Matematica",
          short_name: "MAT",
          created_at: "2026-02-01T00:00:00.000Z",
          updated_at: "2026-02-01T00:00:00.000Z",
        },
        {
          id: "c-2",
          moodle_course_id: "20",
          name: "Historia",
          short_name: "HIS",
          created_at: "2026-02-01T00:00:00.000Z",
          updated_at: "2026-02-01T00:00:00.000Z",
        },
      ],
      error: null,
    });

    ignoredSelectMock.mockReturnValue({ eq: ignoredEqMock });
    ignoredEqMock.mockResolvedValue({
      data: [{ course_id: "c-2" }],
      error: null,
    });

    attendanceSelectMock.mockReturnValue({ eq: attendanceEqMock });
    attendanceEqMock.mockResolvedValue({
      data: [{ course_id: "c-2" }],
      error: null,
    });

    studentCoursesSelectMock.mockImplementation((query: string) => {
      if (query.includes("students!inner")) {
        return {
          eq: (column: string, courseId: string) => {
            if (column !== "course_id") throw new Error("Unexpected at-risk column");
            return Promise.resolve({ data: atRiskByCourse[courseId] || [], error: null });
          },
        };
      }

      return {
        eq: (column: string, courseId: string) => {
          if (column !== "course_id") throw new Error("Unexpected students column");
          return Promise.resolve({
            data: (studentIdsByCourse[courseId] || []).map((student_id) => ({ student_id })),
            error: null,
          });
        },
      };
    });

    pendingSelectMock.mockReturnValue({ eq: pendingEqMock });
    pendingEqMock.mockImplementation((column: string, courseId: string) => {
      if (column !== "course_id") throw new Error("Unexpected pending_tasks column");
      return {
        neq: pendingNeqMock.mockResolvedValueOnce({
          count: pendingCountByCourse[courseId] || 0,
          error: null,
        }),
      };
    });

    userCoursesDeleteMock.mockReturnValue({ eq: userCoursesDeleteEqUserMock });
    userCoursesDeleteEqUserMock.mockImplementation((column: string, value: string) => {
      if (column !== "user_id") throw new Error(`Unexpected user_courses delete column: ${column}`);
      if (!value) throw new Error("Missing user id");
      return {
        eq: userCoursesDeleteEqCourseMock,
        in: userCoursesDeleteInMock,
      };
    });
    userCoursesDeleteEqCourseMock.mockResolvedValue({ error: null });
    userCoursesDeleteInMock.mockResolvedValue({ error: null });
    userCoursesInsertMock.mockResolvedValue({ error: null });

    ignoredDeleteMock.mockReturnValue({ eq: ignoredDeleteEqUserMock });
    ignoredDeleteEqUserMock.mockImplementation((column: string, value: string) => {
      if (column !== "user_id") throw new Error(`Unexpected ignored delete column: ${column}`);
      if (!value) throw new Error("Missing user id");
      return {
        eq: ignoredDeleteEqCourseMock,
        in: ignoredDeleteInMock,
      };
    });
    ignoredDeleteEqCourseMock.mockResolvedValue({ error: null });
    ignoredDeleteInMock.mockResolvedValue({ error: null });
    ignoredInsertMock.mockResolvedValue({ error: null });

    attendanceDeleteMock.mockReturnValue({ eq: attendanceDeleteEqUserMock });
    attendanceDeleteEqUserMock.mockImplementation((column: string, value: string) => {
      if (column !== "user_id") throw new Error(`Unexpected attendance delete column: ${column}`);
      if (!value) throw new Error("Missing user id");
      return {
        eq: attendanceDeleteEqCourseMock,
        in: attendanceDeleteInMock,
      };
    });
    attendanceDeleteEqCourseMock.mockResolvedValue({ error: null });
    attendanceDeleteInMock.mockResolvedValue({ error: null });
    attendanceInsertMock.mockResolvedValue({ error: null });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("loads all courses with stats and follow/ignore flags", async () => {
    const { result } = renderHook(() => useAllCoursesData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.courses).toHaveLength(2);
    expect(result.current.courses[0]).toMatchObject({
      id: "c-1",
      students_count: 3,
      at_risk_count: 2,
      pending_tasks_count: 5,
      is_following: true,
      is_ignored: false,
      is_attendance_enabled: false,
    });
    expect(result.current.courses[1]).toMatchObject({
      id: "c-2",
      students_count: 1,
      at_risk_count: 0,
      pending_tasks_count: 1,
      is_following: false,
      is_ignored: true,
      is_attendance_enabled: true,
    });
  });

  it("toggles follow and switches association role", async () => {
    const { result } = renderHook(() => useAllCoursesData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggleFollow("c-2");
    });

    expect(userCoursesDeleteEqCourseMock).toHaveBeenCalledWith("course_id", "c-2");
    expect(userCoursesInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        course_id: "c-2",
        role: "tutor",
      }),
    );
    expect(result.current.courses.find((course) => course.id === "c-2")?.is_following).toBe(true);

    await act(async () => {
      await result.current.toggleFollow("c-1");
    });

    expect(userCoursesInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        course_id: "c-1",
        role: "viewer",
      }),
    );
    expect(result.current.courses.find((course) => course.id === "c-1")?.is_following).toBe(false);
  });

  it("toggles ignore for a single course", async () => {
    const { result } = renderHook(() => useAllCoursesData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggleIgnore("c-1");
    });

    expect(ignoredInsertMock).toHaveBeenCalledWith({
      user_id: "user-1",
      course_id: "c-1",
    });
    expect(result.current.courses.find((course) => course.id === "c-1")?.is_ignored).toBe(true);

    await act(async () => {
      await result.current.toggleIgnore("c-2");
    });

    expect(ignoredDeleteEqCourseMock).toHaveBeenCalledWith("course_id", "c-2");
    expect(result.current.courses.find((course) => course.id === "c-2")?.is_ignored).toBe(false);
  });

  it("toggles ignore for multiple courses without duplicating existing ignored ones", async () => {
    const { result } = renderHook(() => useAllCoursesData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggleIgnoreMultiple(["c-1", "c-2"], true);
    });

    expect(ignoredInsertMock).toHaveBeenCalledWith([
      {
        user_id: "user-1",
        course_id: "c-1",
      },
    ]);
    expect(result.current.courses.every((course) => course.is_ignored)).toBe(true);

    await act(async () => {
      await result.current.toggleIgnoreMultiple(["c-1", "c-2"], false);
    });

    expect(ignoredDeleteInMock).toHaveBeenCalledWith("course_id", ["c-1", "c-2"]);
    expect(result.current.courses.every((course) => !course.is_ignored)).toBe(true);
  });

  it("unfollows multiple courses using viewer role", async () => {
    const { result } = renderHook(() => useAllCoursesData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.unfollowMultiple(["c-1", "c-2"]);
    });

    expect(userCoursesDeleteInMock).toHaveBeenCalledWith("course_id", ["c-1", "c-2"]);
    expect(userCoursesInsertMock).toHaveBeenCalledWith([
      {
        user_id: "user-1",
        course_id: "c-1",
        role: "viewer",
      },
      {
        user_id: "user-1",
        course_id: "c-2",
        role: "viewer",
      },
    ]);
    expect(result.current.courses.every((course) => !course.is_following)).toBe(true);
  });

  it("toggles attendance for a single course", async () => {
    const { result } = renderHook(() => useAllCoursesData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggleAttendance("c-1");
    });

    expect(attendanceInsertMock).toHaveBeenCalledWith({
      user_id: "user-1",
      course_id: "c-1",
    });
    expect(result.current.courses.find((course) => course.id === "c-1")?.is_attendance_enabled).toBe(true);

    await act(async () => {
      await result.current.toggleAttendance("c-2");
    });

    expect(attendanceDeleteEqCourseMock).toHaveBeenCalledWith("course_id", "c-2");
    expect(result.current.courses.find((course) => course.id === "c-2")?.is_attendance_enabled).toBe(false);
  });

  it("toggles attendance for multiple courses without duplicating existing settings", async () => {
    const { result } = renderHook(() => useAllCoursesData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggleAttendanceMultiple(["c-1", "c-2"], true);
    });

    expect(attendanceInsertMock).toHaveBeenCalledWith([
      {
        user_id: "user-1",
        course_id: "c-1",
      },
    ]);
    expect(result.current.courses.every((course) => course.is_attendance_enabled)).toBe(true);

    await act(async () => {
      await result.current.toggleAttendanceMultiple(["c-1", "c-2"], false);
    });

    expect(attendanceDeleteInMock).toHaveBeenCalledWith("course_id", ["c-1", "c-2"]);
    expect(result.current.courses.every((course) => !course.is_attendance_enabled)).toBe(true);
  });

  it("returns empty courses when user is not authenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });

    const { result } = renderHook(() => useAllCoursesData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.courses).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
