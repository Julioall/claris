import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useStudentProfile } from "@/hooks/useStudentProfile";

const useAuthMock = vi.fn();
const fromMock = vi.fn();

const studentSelectMock = vi.fn();
const studentEqMock = vi.fn();
const studentSingleMock = vi.fn();

const tasksSelectMock = vi.fn();
const tasksEqMock = vi.fn();
const tasksOrderMock = vi.fn();

const actionsSelectMock = vi.fn();
const actionsEqMock = vi.fn();
const actionsOrderMock = vi.fn();

const notesSelectMock = vi.fn();
const notesEqMock = vi.fn();
const notesOrderMock = vi.fn();

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

    if (table === "pending_tasks") {
      return { select: tasksSelectMock };
    }

    if (table === "actions") {
      return { select: actionsSelectMock };
    }

    if (table === "notes") {
      return { select: notesSelectMock };
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

    tasksSelectMock.mockReturnValue({ eq: tasksEqMock });
    tasksEqMock.mockReturnValue({ order: tasksOrderMock });
    tasksOrderMock.mockResolvedValue({
      data: [
        {
          id: "t-1",
          student_id: "s-1",
          course_id: "c-1",
          title: "Contato",
          description: null,
          task_type: "interna",
          status: "aberta",
          priority: "alta",
          due_date: null,
          created_at: "2026-02-20T00:00:00.000Z",
          updated_at: "2026-02-20T00:00:00.000Z",
        },
        {
          id: "t-2",
          student_id: "s-1",
          course_id: "c-1",
          title: "Concluida",
          description: null,
          task_type: "interna",
          status: "resolvida",
          priority: "baixa",
          due_date: null,
          created_at: "2026-02-20T00:00:00.000Z",
          updated_at: "2026-02-20T00:00:00.000Z",
        },
      ],
      error: null,
    });

    actionsSelectMock.mockReturnValue({ eq: actionsEqMock });
    actionsEqMock.mockReturnValue({ order: actionsOrderMock });
    actionsOrderMock.mockResolvedValue({
      data: [
        {
          id: "a-1",
          student_id: "s-1",
          course_id: "c-1",
          user_id: "user-1",
          action_type: "contato",
          description: "Contato realizado",
          status: "concluida",
          scheduled_date: null,
          completed_at: "2026-02-21T00:00:00.000Z",
          created_at: "2026-02-20T00:00:00.000Z",
          updated_at: "2026-02-20T00:00:00.000Z",
        },
      ],
      error: null,
    });

    notesSelectMock.mockReturnValue({ eq: notesEqMock });
    notesEqMock.mockReturnValue({ order: notesOrderMock });
    notesOrderMock.mockResolvedValue({
      data: [
        {
          id: "n-1",
          student_id: "s-1",
          user_id: "user-1",
          content: "Observacao",
          pending_task_id: null,
          created_at: "2026-02-20T00:00:00.000Z",
          updated_at: "2026-02-20T00:00:00.000Z",
        },
      ],
      error: null,
    });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("loads student profile with tasks, actions and notes", async () => {
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.student).toMatchObject({
      id: "s-1",
      current_risk_level: "risco",
    });
    expect(result.current.pendingTasks).toHaveLength(2);
    expect(result.current.actions).toHaveLength(1);
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.stats).toEqual({
      pendingTasksCount: 1,
      actionsCount: 1,
      lastActionDate: "2026-02-21T00:00:00.000Z",
    });
  });

  it("returns early when student id is missing", async () => {
    const { result } = renderHook(() => useStudentProfile(undefined));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fromMock).not.toHaveBeenCalled();
    expect(result.current.student).toBeNull();
  });

  it("returns early when user is not authenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });

    const { result } = renderHook(() => useStudentProfile("s-1"));

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

    const { result } = renderHook(() => useStudentProfile("unknown"));

    await waitFor(() => {
      expect(result.current.error).toContain("não encontrado");
    });

    expect(result.current.student).toBeNull();
  });

  it("handles fetch errors from related resources", async () => {
    actionsOrderMock.mockResolvedValueOnce({
      data: null,
      error: new Error("actions failed"),
    });

    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => {
      expect(result.current.error).toContain("actions failed");
    });
  });

  it("supports explicit refetch", async () => {
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(studentSelectMock).toHaveBeenCalledTimes(2);
    expect(tasksSelectMock).toHaveBeenCalledTimes(2);
  });
});
