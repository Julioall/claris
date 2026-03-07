import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMoodleApi } from "@/hooks/useMoodleApi";

const invokeMock = vi.fn();
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

const session = {
  moodleToken: "token-123",
  moodleUserId: 99,
  moodleUrl: "https://moodle.example.com",
};

describe("useMoodleApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("logs in successfully and normalizes Moodle URL", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        moodleToken: "abc",
        moodleUserId: 101,
        user: { id: "u-1", full_name: "Julio" },
      },
      error: null,
    });

    const { result } = renderHook(() => useMoodleApi());

    let loginResult: Awaited<ReturnType<typeof result.current.login>> | undefined;
    await act(async () => {
      loginResult = await result.current.login("julio", "secret", "https://moodle.local/");
    });

    expect(invokeMock).toHaveBeenCalledWith("moodle-auth", {
      body: {
        moodleUrl: "https://moodle.local",
        username: "julio",
        password: "secret",
      },
    });
    expect(loginResult).toEqual({
      success: true,
      user: { id: "u-1", full_name: "Julio" },
      session: {
        moodleToken: "abc",
        moodleUserId: 101,
        moodleUrl: "https://moodle.local",
      },
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("returns error on failed login invocation", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: "invalid credentials" },
    });

    const { result } = renderHook(() => useMoodleApi());

    let loginResult: Awaited<ReturnType<typeof result.current.login>> | undefined;
    await act(async () => {
      loginResult = await result.current.login("julio", "wrong", "https://moodle.local");
    });

    expect(loginResult).toEqual({
      success: false,
      error: "invalid credentials",
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("syncs courses and clears progress when Moodle returns domain error", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { error: "permission denied" },
      error: null,
    });

    const { result } = renderHook(() => useMoodleApi());

    let syncResult: Awaited<ReturnType<typeof result.current.syncCourses>> | undefined;
    await act(async () => {
      syncResult = await result.current.syncCourses(session);
    });

    expect(syncResult).toEqual({
      success: false,
      error: "permission denied",
    });
    expect(result.current.syncProgress).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("syncs students for a specific course id", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { students: [{ id: "s-1" }, { id: "s-2" }] },
      error: null,
    });

    const { result } = renderHook(() => useMoodleApi());

    let syncResult: Awaited<ReturnType<typeof result.current.syncStudents>> | undefined;
    await act(async () => {
      syncResult = await result.current.syncStudents(session, "42");
    });

    expect(invokeMock).toHaveBeenCalledWith("moodle-sync-students", {
      body: {
        moodleUrl: "https://moodle.example.com",
        token: "token-123",
        courseId: 42,
      },
    });
    expect(syncResult).toEqual({
      success: true,
      students: [{ id: "s-1" }, { id: "s-2" }],
    });
    expect(result.current.syncProgress).toBeNull();
  });

  it("syncs all students across courses and aggregates totals", async () => {
    invokeMock
      .mockResolvedValueOnce({
        data: { students: [{ id: "s-1" }, { id: "s-2" }] },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { error: "failed on course" },
        error: null,
      });

    const { result } = renderHook(() => useMoodleApi());

    let syncAllResult: Awaited<ReturnType<typeof result.current.syncAllStudents>> | undefined;
    await act(async () => {
      syncAllResult = await result.current.syncAllStudents(session, [
        { id: "c-1", name: "Mat", moodle_course_id: "10" } as any,
        { id: "c-2", name: "His", moodle_course_id: "20" } as any,
      ]);
    });

    expect(syncAllResult).toEqual({
      success: true,
      totalStudents: 2,
    });

    const syncStudentCalls = invokeMock.mock.calls.filter(
      (call) => call[0] === "moodle-sync-students",
    );
    expect(syncStudentCalls).toHaveLength(2);
    expect(syncStudentCalls[0][1].body.courseId).toBe(10);
    expect(syncStudentCalls[1][1].body.courseId).toBe(20);

    expect(result.current.syncProgress).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
