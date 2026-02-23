import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useDashboardData } from "@/hooks/useDashboardData";

const useAuthMock = vi.fn();
const fromMock = vi.fn();

const userCoursesSelectMock = vi.fn();
const userCoursesEqUserMock = vi.fn();
const userCoursesEqRoleMock = vi.fn();

const studentCoursesSelectMock = vi.fn();
const studentCoursesInMock = vi.fn();
const studentCoursesNeqMock = vi.fn();

const actionsSelectMock = vi.fn();
const actionsEqUserMock = vi.fn();
const actionsEqStatusMock = vi.fn();
const actionsGteMock = vi.fn();
const actionsLteMock = vi.fn();
const actionsLtMock = vi.fn();

const pendingTasksSelectMock = vi.fn();
const pendingTasksInMock = vi.fn();
const pendingTasksNeqMock = vi.fn();

const studentsSelectMock = vi.fn();
const studentsInIdMock = vi.fn();
const studentsInRiskMock = vi.fn();

const riskHistorySelectMock = vi.fn();
const riskHistoryInStudentMock = vi.fn();
const riskHistoryInLevelMock = vi.fn();
const riskHistoryGteMock = vi.fn();

const feedSelectMock = vi.fn();
const feedOrMock = vi.fn();
const feedOrderMock = vi.fn();
const feedLimitMock = vi.fn();

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

function isoDaysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function setupFromMock() {
  fromMock.mockImplementation((table: string) => {
    if (table === "user_courses") {
      return { select: userCoursesSelectMock };
    }

    if (table === "student_courses") {
      return { select: studentCoursesSelectMock };
    }

    if (table === "actions") {
      return { select: actionsSelectMock };
    }

    if (table === "pending_tasks") {
      return { select: pendingTasksSelectMock };
    }

    if (table === "students") {
      return { select: studentsSelectMock };
    }

    if (table === "risk_history") {
      return { select: riskHistorySelectMock };
    }

    if (table === "activity_feed") {
      return { select: feedSelectMock };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("useDashboardData", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: "user-1" } });

    setupFromMock();

    userCoursesSelectMock.mockReturnValue({ eq: userCoursesEqUserMock });
    userCoursesEqUserMock.mockReturnValue({ eq: userCoursesEqRoleMock });
    userCoursesEqRoleMock.mockResolvedValue({
      data: [{ course_id: "c-1", role: "tutor" }],
      error: null,
    });

    studentCoursesSelectMock.mockReturnValue({ in: studentCoursesInMock });
    studentCoursesInMock.mockReturnValue({ neq: studentCoursesNeqMock });
    studentCoursesNeqMock.mockResolvedValue({
      data: [
        { student_id: "s-1", enrollment_status: "ativo" },
        { student_id: "s-2", enrollment_status: "ativo" },
      ],
      error: null,
    });

    actionsSelectMock.mockReturnValue({ eq: actionsEqUserMock });
    actionsEqUserMock.mockReturnValue({ eq: actionsEqStatusMock });

    let actionStatusCall = 0;
    actionsEqStatusMock.mockImplementation((_column: string, status: string) => {
      actionStatusCall += 1;

      if (status === "concluida") {
        return { gte: actionsGteMock };
      }

      if (status === "planejada" && actionStatusCall === 2) {
        return Promise.resolve({ count: 5, error: null });
      }

      if (status === "planejada" && actionStatusCall === 3) {
        return { lt: actionsLtMock };
      }

      return Promise.resolve({ count: 0, error: null });
    });

    actionsGteMock.mockReturnValue({ lte: actionsLteMock });
    actionsLteMock.mockResolvedValue({ count: 3, error: null });
    actionsLtMock.mockResolvedValue({ count: 1, error: null });

    pendingTasksSelectMock.mockReturnValue({ in: pendingTasksInMock });
    pendingTasksInMock.mockReturnValue({ neq: pendingTasksNeqMock });
    pendingTasksNeqMock.mockResolvedValue({
      data: [
        {
          id: "pt-1",
          student_id: "s-1",
          course_id: "c-1",
          created_by_user_id: "user-1",
          title: "Vencida",
          description: "Atrasada",
          task_type: "interna",
          status: "aberta",
          priority: "alta",
          due_date: isoDaysFromNow(-2),
          created_at: "2026-02-20T10:00:00.000Z",
          updated_at: "2026-02-20T10:00:00.000Z",
          students: {
            id: "s-1",
            full_name: "Ana",
            current_risk_level: "risco",
            email: "ana@example.com",
          },
        },
        {
          id: "pt-2",
          student_id: "s-2",
          course_id: "c-1",
          created_by_user_id: "user-1",
          title: "Proxima",
          description: "Prazo curto",
          task_type: "interna",
          status: "aberta",
          priority: "media",
          due_date: isoDaysFromNow(2),
          created_at: "2026-02-20T10:00:00.000Z",
          updated_at: "2026-02-20T10:00:00.000Z",
          students: {
            id: "s-2",
            full_name: "Bruno",
            current_risk_level: "critico",
            email: "bruno@example.com",
          },
        },
        {
          id: "pt-3",
          student_id: "s-2",
          course_id: "c-1",
          created_by_user_id: "user-1",
          title: "Resolvida",
          description: "Concluida",
          task_type: "interna",
          status: "resolvida",
          priority: "baixa",
          due_date: isoDaysFromNow(1),
          created_at: "2026-02-20T10:00:00.000Z",
          updated_at: "2026-02-20T10:00:00.000Z",
          students: {
            id: "s-2",
            full_name: "Bruno",
            current_risk_level: "critico",
            email: "bruno@example.com",
          },
        },
      ],
      count: 3,
      error: null,
    });

    studentsSelectMock.mockReturnValue({ in: studentsInIdMock });
    studentsInIdMock.mockReturnValue({ in: studentsInRiskMock });
    studentsInRiskMock.mockResolvedValue({
      data: [
        {
          id: "s-1",
          moodle_user_id: "10",
          full_name: "Ana",
          email: "ana@example.com",
          current_risk_level: "risco",
          created_at: "2026-02-01T00:00:00.000Z",
          updated_at: "2026-02-01T00:00:00.000Z",
        },
        {
          id: "s-2",
          moodle_user_id: "11",
          full_name: "Bruno",
          email: "bruno@example.com",
          current_risk_level: "critico",
          created_at: "2026-02-01T00:00:00.000Z",
          updated_at: "2026-02-01T00:00:00.000Z",
        },
      ],
      error: null,
    });

    riskHistorySelectMock.mockReturnValue({ in: riskHistoryInStudentMock });
    riskHistoryInStudentMock.mockReturnValue({ in: riskHistoryInLevelMock });
    riskHistoryInLevelMock.mockReturnValue({ gte: riskHistoryGteMock });
    riskHistoryGteMock.mockResolvedValue({ count: 2, error: null });

    feedSelectMock.mockReturnValue({ or: feedOrMock });
    feedOrMock.mockReturnValue({ order: feedOrderMock });
    feedOrderMock.mockReturnValue({ limit: feedLimitMock });
    feedLimitMock.mockResolvedValue({
      data: [
        {
          id: "f-1",
          user_id: "user-1",
          student_id: "s-1",
          course_id: "c-1",
          event_type: "task_created",
          title: "Nova pendencia",
          description: "Criada agora",
          metadata: { priority: "alta" },
          created_at: "2026-02-21T10:00:00.000Z",
          students: { id: "s-1", full_name: "Ana" },
        },
      ],
      error: null,
    });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("returns early when user is not authenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.summary).toBeNull();
    expect(result.current.pendingTasks).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns empty dashboard summary when user has no tutor courses", async () => {
    userCoursesEqRoleMock.mockResolvedValueOnce({ data: [], error: null });

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.summary).toEqual({
      completed_actions: 0,
      pending_actions: 0,
      overdue_actions: 0,
      pending_tasks: 0,
      students_at_risk: 0,
      new_at_risk_this_week: 0,
      students_without_contact: 0,
    });
    expect(result.current.pendingTasks).toEqual([]);
    expect(result.current.criticalStudents).toEqual([]);
    expect(result.current.activityFeed).toEqual([]);
  });

  it("loads dashboard metrics and computes overdue/upcoming tasks", async () => {
    const { result } = renderHook(() => useDashboardData("current", "all"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.summary).toEqual({
      completed_actions: 3,
      pending_actions: 5,
      overdue_actions: 1,
      pending_tasks: 3,
      students_at_risk: 2,
      new_at_risk_this_week: 2,
      students_without_contact: 0,
    });

    expect(result.current.pendingTasks).toHaveLength(3);
    expect(result.current.overdueActions.map((task) => task.id)).toEqual(["pt-1"]);
    expect(result.current.upcomingTasks.map((task) => task.id)).toEqual(["pt-2"]);
    expect(result.current.criticalStudents.map((student) => student.id)).toEqual(["s-1", "s-2"]);
    expect(result.current.activityFeed).toHaveLength(1);
    expect(result.current.activityFeed[0]).toMatchObject({
      id: "f-1",
      title: "Nova pendencia",
      student: { id: "s-1", full_name: "Ana" },
    });
  });
});
