import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useStudentProfile } from "@/features/students/hooks/useStudentProfile";
import { createQueryClientWrapper } from "@/test/query-client";

const useAuthMock = vi.fn();
const fromMock = vi.fn();

const studentSelectMock = vi.fn();
const studentEqMock = vi.fn();
const studentSingleMock = vi.fn();

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
    if (table === "students") {
      return { select: studentSelectMock };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("useStudentProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: "user-1" } });

    setupFromMock();

    studentSelectMock.mockReturnValue({ eq: studentEqMock });
    studentEqMock.mockReturnValue({ single: studentSingleMock });
    studentSingleMock.mockResolvedValue({
      data: {
        id: "s-1",
        moodle_user_id: "10",
        full_name: "Ana Silva",
        email: "ana@example.com",
        avatar_url: null,
        current_risk_level: "risco",
        risk_reasons: ["falta"],
        tags: ["prioridade"],
        last_access: "2026-02-20T00:00:00.000Z",
        created_at: "2026-02-01T00:00:00.000Z",
        updated_at: "2026-02-01T00:00:00.000Z",
      },
      error: null,
    });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("loads student profile", async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentProfile("s-1"), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.student).toMatchObject({
      id: "s-1",
      current_risk_level: "risco",
    });
  });

  it("returns early when student id is missing", async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentProfile(undefined), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fromMock).not.toHaveBeenCalled();
    expect(result.current.student).toBeNull();
  });

  it("returns early when user is not authenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentProfile("s-1"), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fromMock).not.toHaveBeenCalled();
    expect(result.current.student).toBeNull();
  });

  it("sets not-found message when student does not exist", async () => {
    studentSingleMock.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST116", message: "No rows" },
    });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentProfile("unknown"), { wrapper });

    await waitFor(() => {
      expect(result.current.error?.toLowerCase()).toMatch(/n.o encontrado/);
    });

    expect(result.current.student).toBeNull();
  });

  it("handles fetch errors", async () => {
    studentSingleMock.mockResolvedValueOnce({
      data: null,
      error: new Error("fetch failed"),
    });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentProfile("s-1"), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });

  it("supports explicit refetch", async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentProfile("s-1"), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(studentSelectMock).toHaveBeenCalledTimes(2);
  });
});
