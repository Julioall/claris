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

const pendingTasksSelectMock = vi.fn();
const pendingTasksInMock = vi.fn();
const pendingTasksNeqMock = vi.fn();

const studentsSelectMock = vi.fn();
const studentsInIdMock = vi.fn();
const studentsInRiskMock = vi.fn();
const studentsEqRiskLevelMock = vi.fn();

const riskHistorySelectMock = vi.fn();
const riskHistoryInStudentMock = vi.fn();
const riskHistoryInLevelMock = vi.fn();
const riskHistoryGteMock = vi.fn();

const feedSelectMock = vi.fn();
const feedOrMock = vi.fn();
const feedOrderMock = vi.fn();
const feedLimitMock = vi.fn();

const studentActivitiesSelectMock = vi.fn();

const missedActivitiesInCourseMock = vi.fn();
const missedActivitiesInStudentMock = vi.fn();
const missedActivitiesEqTypeMock = vi.fn();
const missedActivitiesNotDueMock = vi.fn();
const missedActivitiesLtDueMock = vi.fn();
const missedActivitiesIsSubmittedMock = vi.fn();
const missedActivitiesEqHiddenMock = vi.fn();

const uncorrectedActivitiesInCourseMock = vi.fn();
const uncorrectedActivitiesInStudentMock = vi.fn();
const uncorrectedActivitiesEqTypeMock = vi.fn();
const uncorrectedActivitiesIsGradedMock = vi.fn();
const uncorrectedActivitiesEqHiddenMock = vi.fn();
const uncorrectedActivitiesNotSubmittedMock = vi.fn();

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

    if (table === "student_activities") {
      return { select: studentActivitiesSelectMock };
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
    studentCoursesInMock.mockResolvedValue({
      data: [
        { student_id: "s-1", enrollment_status: "ativo" },
        { student_id: "s-2", enrollment_status: "ativo" },
        { student_id: "s-3", enrollment_status: "suspenso" },
      ],
      error: null,
    });

    // pending_tasks is now a count-only query
    pendingTasksSelectMock.mockReturnValue({ in: pendingTasksInMock });
    pendingTasksInMock.mockReturnValue({ neq: pendingTasksNeqMock });
    pendingTasksNeqMock.mockResolvedValue({
      count: 2,
      error: null,
    });

    studentsSelectMock.mockReturnValue({ in: studentsInIdMock });
    studentsInIdMock.mockImplementation(() => ({
      in: studentsInRiskMock,
      eq: studentsEqRiskLevelMock,
    }));
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
    studentsEqRiskLevelMock.mockResolvedValue({ count: 0, error: null });

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

    studentActivitiesSelectMock
      .mockReturnValueOnce({ in: missedActivitiesInCourseMock })
      .mockReturnValueOnce({ in: uncorrectedActivitiesInCourseMock });

    missedActivitiesInCourseMock.mockReturnValue({ in: missedActivitiesInStudentMock });
    missedActivitiesInStudentMock.mockReturnValue({ eq: missedActivitiesEqTypeMock });
    missedActivitiesEqTypeMock.mockReturnValue({ not: missedActivitiesNotDueMock });
    missedActivitiesNotDueMock.mockReturnValue({ lt: missedActivitiesLtDueMock });
    missedActivitiesLtDueMock.mockReturnValue({ is: missedActivitiesIsSubmittedMock });
    missedActivitiesIsSubmittedMock.mockReturnValue({ eq: missedActivitiesEqHiddenMock });
    missedActivitiesEqHiddenMock.mockResolvedValue({ count: 1, error: null });

    uncorrectedActivitiesInCourseMock.mockReturnValue({ in: uncorrectedActivitiesInStudentMock });
    uncorrectedActivitiesInStudentMock.mockReturnValue({ eq: uncorrectedActivitiesEqTypeMock });
    uncorrectedActivitiesEqTypeMock.mockReturnValue({ is: uncorrectedActivitiesIsGradedMock });
    uncorrectedActivitiesIsGradedMock.mockReturnValue({ eq: uncorrectedActivitiesEqHiddenMock });
    uncorrectedActivitiesEqHiddenMock.mockReturnValue({ not: uncorrectedActivitiesNotSubmittedMock });
    uncorrectedActivitiesNotSubmittedMock.mockResolvedValue({
      data: [
        {
          id: "act-1",
          student_id: "s-2",
          course_id: "c-1",
          activity_name: "Trabalho final",
          due_date: isoDaysFromNow(-4),
          submitted_at: isoDaysFromNow(-3),
          students: {
            id: "s-2",
            full_name: "Bruno",
            current_risk_level: "critico",
          },
          courses: {
            id: "c-1",
            name: "Curso 1",
            short_name: "CUR-1",
          },
        },
        {
          id: "act-2",
          student_id: "s-1",
          course_id: "c-1",
          activity_name: "Estudo dirigido",
          due_date: isoDaysFromNow(2),
          submitted_at: isoDaysFromNow(-1),
          students: {
            id: "s-1",
            full_name: "Ana",
            current_risk_level: "risco",
          },
          courses: {
            id: "c-1",
            name: "Curso 1",
            short_name: "CUR-1",
          },
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
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns empty dashboard summary when user has no tutor courses", async () => {
    userCoursesEqRoleMock.mockResolvedValueOnce({ data: [], error: null });

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.summary).toEqual({
      pending_tasks: 0,
      overdue_tasks: 0,
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
    const { result } = renderHook(() => useDashboardData("current", "all"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.summary).toEqual({
      pending_tasks: 2,
      overdue_tasks: 0,
      activities_to_review: 2,
      active_normal_students: 0,
      pending_submission_assignments: 1,
      pending_correction_assignments: 2,
      students_at_risk: 2,
      new_at_risk_this_week: 2,
    });

    expect(missedActivitiesInStudentMock).toHaveBeenCalledWith("student_id", ["s-1", "s-2"]);
    expect(uncorrectedActivitiesInStudentMock).toHaveBeenCalledWith("student_id", ["s-1", "s-2"]);

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
