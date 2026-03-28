import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useStudentsData } from "@/features/students/hooks/useStudentsData";
import { createQueryClientWrapper } from "@/test/query-client";
import type { StudentListItem } from "@/features/students/types";

const useAuthMock = vi.fn();
const listStudentsForUserMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/features/students/api/students.repository", () => ({
  listStudentsForUser: (...args: unknown[]) => listStudentsForUserMock(...args),
}));

const studentsResponse: StudentListItem[] = [
  {
    id: "s-2",
    moodle_user_id: "11",
    full_name: "Bruno",
    current_risk_level: "critico",
    enrollment_status: "suspenso",
    created_at: "2026-02-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "s-1",
    moodle_user_id: "10",
    full_name: "Ana",
    current_risk_level: "atencao",
    enrollment_status: "ativo",
    created_at: "2026-02-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "s-3",
    moodle_user_id: "12",
    full_name: "Carla",
    current_risk_level: "normal",
    enrollment_status: "concluido",
    created_at: "2026-02-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
  },
];

describe("useStudentsData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: "user-1" } });
    listStudentsForUserMock.mockResolvedValue(studentsResponse);
  });

  it("loads students for the authenticated user", async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentsData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.students).toEqual(studentsResponse);
    expect(listStudentsForUserMock).toHaveBeenCalledWith({ userId: "user-1", courseId: undefined });
  });

  it("returns empty data when user is not authenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentsData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.students).toEqual([]);
    expect(listStudentsForUserMock).not.toHaveBeenCalled();
  });

  it("stores an error when loading students fails", async () => {
    listStudentsForUserMock.mockRejectedValueOnce(new Error("students query failed"));

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentsData(), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toContain("students query failed");
    });
  });

  it("applies explicit course filter when provided", async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentsData("course-fixed"), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(listStudentsForUserMock).toHaveBeenCalledWith({ userId: "user-1", courseId: "course-fixed" });
  });
});
