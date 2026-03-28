import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useDashboardData } from "@/features/dashboard/hooks/useDashboardData";
import { createQueryClientWrapper } from "@/test/query-client";
import type { DashboardData } from "@/features/dashboard/types";

const useAuthMock = vi.fn();
const getDashboardDataMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/features/dashboard/api/dashboard.repository", () => ({
  dashboardRepository: {
    getDashboardData: (...args: unknown[]) => getDashboardDataMock(...args),
  },
}));

const dashboardDataResponse: DashboardData = {
  summary: {
    today_events: 2,
    today_tasks: 3,
    activities_to_review: 12,
    active_normal_students: 0,
    pending_submission_assignments: 1,
    pending_correction_assignments: 12,
    students_at_risk: 2,
    new_at_risk_this_week: 2,
  },
  criticalStudents: [
    {
      id: "s-2",
      moodle_user_id: "11",
      full_name: "Bruno",
      email: "bruno@example.com",
      current_risk_level: "critico",
      created_at: "2026-02-01T00:00:00.000Z",
      updated_at: "2026-02-01T00:00:00.000Z",
    },
    {
      id: "s-1",
      moodle_user_id: "10",
      full_name: "Ana",
      email: "ana@example.com",
      current_risk_level: "risco",
      created_at: "2026-02-01T00:00:00.000Z",
      updated_at: "2026-02-01T00:00:00.000Z",
    },
  ],
  activitiesToReview: [
    {
      id: "act-1",
      activity_name: "Trabalho final",
      student_id: "s-2",
      course_id: "c-1",
      due_date: "2026-03-20T00:00:00.000Z",
      submitted_at: "2026-03-21T00:00:00.000Z",
      student: {
        id: "s-2",
        full_name: "Bruno",
        current_risk_level: "critico",
      },
      course: {
        id: "c-1",
        name: "Curso 1",
        short_name: "CUR-1",
      },
    },
    {
      id: "act-2",
      activity_name: "Estudo dirigido",
      student_id: "s-1",
      course_id: "c-1",
      due_date: "2026-03-22T00:00:00.000Z",
      submitted_at: "2026-03-23T00:00:00.000Z",
      student: {
        id: "s-1",
        full_name: "Ana",
        current_risk_level: "risco",
      },
      course: {
        id: "c-1",
        name: "Curso 1",
        short_name: "CUR-1",
      },
    },
  ],
  activityFeed: [
    {
      id: "f-1",
      event_type: "task_created",
      title: "Nova pendencia",
      description: "Criada agora",
      metadata: { priority: "alta" },
      created_at: "2026-02-21T10:00:00.000Z",
      student: {
        id: "s-1",
        moodle_user_id: "",
        full_name: "Ana",
        current_risk_level: "normal",
        created_at: "",
        updated_at: "",
      },
    },
  ],
};

describe("useDashboardData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: "user-1" } });
    getDashboardDataMock.mockResolvedValue(dashboardDataResponse);
  });

  it("returns early when user is not authenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { wrapper } = createQueryClientWrapper();

    const { result } = renderHook(() => useDashboardData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.summary).toBeNull();
    expect(getDashboardDataMock).not.toHaveBeenCalled();
  });

  it("returns empty dashboard summary when the repository has no accessible data", async () => {
    getDashboardDataMock.mockResolvedValueOnce({
      summary: {
        today_events: 0,
        today_tasks: 0,
        activities_to_review: 0,
        active_normal_students: 0,
        pending_submission_assignments: 0,
        pending_correction_assignments: 0,
        students_at_risk: 0,
        new_at_risk_this_week: 0,
      },
      criticalStudents: [],
      activitiesToReview: [],
      activityFeed: [],
    });
    const { wrapper } = createQueryClientWrapper();

    const { result } = renderHook(() => useDashboardData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.summary).toEqual({
      today_events: 0,
      today_tasks: 0,
      activities_to_review: 0,
      active_normal_students: 0,
      pending_submission_assignments: 0,
      pending_correction_assignments: 0,
      students_at_risk: 0,
      new_at_risk_this_week: 0,
    });
    expect(result.current.criticalStudents).toEqual([]);
    expect(result.current.activitiesToReview).toEqual([]);
    expect(result.current.activityFeed).toEqual([]);
  });

  it("loads dashboard metrics correctly", async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useDashboardData("current", "all"), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.summary).toEqual(dashboardDataResponse.summary);
    expect(getDashboardDataMock).toHaveBeenCalledWith({
      userId: "user-1",
      selectedWeek: "current",
      courseFilter: "all",
    });
    expect(result.current.criticalStudents.map((student) => student.id)).toEqual(["s-2", "s-1"]);
    expect(result.current.activitiesToReview).toHaveLength(2);
    expect(result.current.activitiesToReview[0]).toMatchObject({
      id: "act-1",
      activity_name: "Trabalho final",
      student: { id: "s-2", full_name: "Bruno" },
      course: { id: "c-1", short_name: "CUR-1" },
    });
    expect(result.current.activityFeed).toHaveLength(1);
    expect(result.current.activityFeed[0]).toMatchObject({
      id: "f-1",
      title: "Nova pendencia",
      student: { id: "s-1", full_name: "Ana" },
    });
  });
});
