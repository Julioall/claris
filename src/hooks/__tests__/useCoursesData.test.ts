import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCoursesData } from "@/hooks/useCoursesData";

const useAuthMock = vi.fn();
const fromMock = vi.fn();

const userCoursesSelectMock = vi.fn();
const userCoursesEqUserMock = vi.fn();
const userCoursesEqRoleMock = vi.fn();

const studentCountSelectMock = vi.fn();
const studentCountEqMock = vi.fn();

const studentRiskSelectMock = vi.fn();
const studentRiskEqMock = vi.fn();

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

function setupFromMock() {
  fromMock.mockImplementation((table: string) => {
    if (table === "user_courses") {
      return {
        select: userCoursesSelectMock,
      };
    }

    if (table === "student_courses") {
      return {
        select: (query: string, options?: { count?: string; head?: boolean }) => {
          if (options?.count === "exact") {
            return studentCountSelectMock(query, options);
          }
          return studentRiskSelectMock(query, options);
        },
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("useCoursesData", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: "user-1" } });

    setupFromMock();

    userCoursesSelectMock.mockReturnValue({ eq: userCoursesEqUserMock });
    userCoursesEqUserMock.mockReturnValue({ eq: userCoursesEqRoleMock });
    userCoursesEqRoleMock.mockResolvedValue({
      data: [
        {
          course_id: "c-1",
          role: "tutor",
          courses: {
            id: "c-1",
            name: "Matematica",
            short_name: "MAT",
            moodle_course_id: "10",
            created_at: "2026-02-01T00:00:00.000Z",
            updated_at: "2026-02-01T00:00:00.000Z",
          },
        },
      ],
      error: null,
    });

    studentCountSelectMock.mockReturnValue({ eq: studentCountEqMock });
    studentCountEqMock.mockResolvedValue({ count: 25, error: null });

    studentRiskSelectMock.mockReturnValue({ eq: studentRiskEqMock });
    studentRiskEqMock.mockResolvedValue({
      data: [
        { student_id: "s-1", students: { current_risk_level: "risco" } },
        { student_id: "s-2", students: { current_risk_level: "normal" } },
        { student_id: "s-3", students: { current_risk_level: "critico" } },
      ],
      error: null,
    });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("loads tutor courses and computes stats", async () => {
    const { result } = renderHook(() => useCoursesData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.courses).toEqual([
      expect.objectContaining({
        id: "c-1",
        name: "Matematica",
        students_count: 25,
        at_risk_count: 2,
      }),
    ]);
  });

  it("returns an empty list when user has no tutor courses", async () => {
    userCoursesEqRoleMock.mockResolvedValueOnce({ data: [], error: null });

    const { result } = renderHook(() => useCoursesData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.courses).toEqual([]);
    expect(studentCountEqMock).not.toHaveBeenCalled();
  });

  it("stores an error when fetching user courses fails", async () => {
    userCoursesEqRoleMock.mockResolvedValueOnce({
      data: null,
      error: new Error("query failed"),
    });

    const { result } = renderHook(() => useCoursesData());

    await waitFor(() => {
      expect(result.current.error).toContain("query failed");
    });
  });

  it("returns immediately when user is not authenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });

    const { result } = renderHook(() => useCoursesData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.courses).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
