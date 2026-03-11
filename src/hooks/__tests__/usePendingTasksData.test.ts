import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { usePendingTasksData } from "@/hooks/usePendingTasksData";

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const pendingTasksSelectMock = vi.fn();
const pendingTasksOrMock = vi.fn();
const pendingTasksOrderMock = vi.fn();
const pendingTasksUpdateMock = vi.fn();
const pendingTasksUpdateEqMock = vi.fn();
const pendingTasksDeleteMock = vi.fn();
const pendingTasksDeleteEqMock = vi.fn();
const pendingTasksInsertMock = vi.fn();
const pendingTasksRecurrenceEqMock = vi.fn();
const pendingTasksRecurrenceNeqMock = vi.fn();
const pendingTasksRecurrenceLimitMock = vi.fn();
const recurrenceSelectMock = vi.fn();
const recurrenceEqMock = vi.fn();
const recurrenceMaybeSingleMock = vi.fn();
const recurrenceUpdateMock = vi.fn();
const recurrenceUpdateEqMock = vi.fn();
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

const defaultTaskRows = [
  {
    id: "t-1",
    student_id: "s-1",
    course_id: "c-1",
    category_name: "Escola A",
    created_by_user_id: "user-1",
    assigned_to_user_id: null,
    title: "Contato urgente",
    description: "Ligar para aluno",
    task_type: "interna",
    status: "aberta",
    priority: "alta",
    due_date: "2099-01-01T00:00:00.000Z",
    completed_at: null,
    moodle_activity_id: null,
    automation_type: "manual",
    is_recurring: false,
    recurrence_id: null,
    parent_task_id: null,
    created_at: "2026-02-20T10:00:00.000Z",
    updated_at: "2026-02-20T10:00:00.000Z",
    students: { id: "s-1", full_name: "Ana Silva" },
    courses: { id: "c-1", short_name: "MAT" },
  },
  {
    id: "t-2",
    student_id: null,
    course_id: "c-1",
    category_name: null,
    created_by_user_id: "user-1",
    assigned_to_user_id: null,
    title: "Sem valores",
    description: null,
    task_type: null,
    status: null,
    priority: null,
    due_date: null,
    completed_at: null,
    moodle_activity_id: null,
    automation_type: null,
    is_recurring: null,
    recurrence_id: null,
    parent_task_id: null,
    created_at: null,
    updated_at: null,
    students: null,
    courses: { id: "c-1", short_name: "MAT" },
  },
];

function setupPendingTasksChain() {
  pendingTasksSelectMock.mockImplementation((query: string) => {
    if (query.includes("students")) {
      return { or: pendingTasksOrMock };
    }

    if (query === "id") {
      return { eq: pendingTasksRecurrenceEqMock };
    }

    throw new Error(`Unexpected select query: ${query}`);
  });

  pendingTasksOrMock.mockReturnValue({ order: pendingTasksOrderMock });
  pendingTasksUpdateMock.mockReturnValue({ eq: pendingTasksUpdateEqMock });
  pendingTasksDeleteMock.mockReturnValue({ eq: pendingTasksDeleteEqMock });
  pendingTasksRecurrenceEqMock.mockReturnValue({ neq: pendingTasksRecurrenceNeqMock });
  pendingTasksRecurrenceNeqMock.mockReturnValue({ limit: pendingTasksRecurrenceLimitMock });

  recurrenceSelectMock.mockReturnValue({ eq: recurrenceEqMock });
  recurrenceEqMock.mockReturnValue({
    maybeSingle: recurrenceMaybeSingleMock,
    single: recurrenceMaybeSingleMock,
  });
  recurrenceUpdateMock.mockReturnValue({ eq: recurrenceUpdateEqMock });

  fromMock.mockImplementation((table: string) => {
    if (table === "pending_tasks") {
      return {
        select: pendingTasksSelectMock,
        update: pendingTasksUpdateMock,
        delete: pendingTasksDeleteMock,
        insert: pendingTasksInsertMock,
      };
    }

    if (table === "task_recurrence_configs") {
      return {
        select: recurrenceSelectMock,
        update: recurrenceUpdateMock,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("usePendingTasksData", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: "user-1" } });
    setupPendingTasksChain();

    pendingTasksOrderMock.mockResolvedValue({ data: defaultTaskRows, error: null });
    pendingTasksUpdateEqMock.mockResolvedValue({ error: null });
    pendingTasksDeleteEqMock.mockResolvedValue({ error: null });
    pendingTasksInsertMock.mockResolvedValue({ error: null });
    pendingTasksRecurrenceLimitMock.mockResolvedValue({ data: [], error: null });
    recurrenceMaybeSingleMock.mockResolvedValue({
      data: {
        id: "r-1",
        title: "Contato urgente",
        description: "Ligar para aluno",
        pattern: "semanal",
        end_date: null,
      },
      error: null,
    });
    recurrenceUpdateEqMock.mockResolvedValue({ error: null });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("loads tasks and derives unique course filters", async () => {
    const { result } = renderHook(() => usePendingTasksData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.tasks[0]).toMatchObject({
      id: "t-1",
      student: { full_name: "Ana Silva" },
      course: { short_name: "MAT" },
      automation_type: "manual",
      is_recurring: false,
      category_name: "Escola A",
    });
    expect(result.current.tasks[1]).toMatchObject({
      task_type: "interna",
      status: "aberta",
      priority: "media",
    });
    expect(result.current.courses).toEqual([{ id: "c-1", short_name: "MAT" }]);
  });

  it("marks a recurring task as resolved, creates the next occurrence and refetches data", async () => {
    pendingTasksOrderMock.mockResolvedValue({
      data: [
        {
          ...defaultTaskRows[0],
          automation_type: "recurring",
          is_recurring: true,
          recurrence_id: "r-1",
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => usePendingTasksData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.markAsResolved("t-1");
    });

    expect(ok).toBe(true);
    expect(pendingTasksUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "resolvida",
        completed_at: expect.any(String),
      }),
    );
    expect(recurrenceMaybeSingleMock).toHaveBeenCalledTimes(1);
    expect(pendingTasksInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Contato urgente",
        recurrence_id: "r-1",
        is_recurring: true,
        parent_task_id: "t-1",
        automation_type: "recurring",
        status: "aberta",
      }),
    );
    expect(recurrenceUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        last_generated_at: expect.any(String),
        next_generation_at: expect.any(String),
      }),
    );
    expect(pendingTasksOrderMock).toHaveBeenCalledTimes(2);
  });

  it("returns false when creating a task without authenticated user", async () => {
    useAuthMock.mockReturnValue({ user: null });

    const { result } = renderHook(() => usePendingTasksData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.createTask({
        student_id: "s-1",
        course_id: "c-1",
        title: "Teste",
        task_type: "interna",
        priority: "media",
      });
    });

    expect(ok).toBe(false);
    expect(pendingTasksInsertMock).not.toHaveBeenCalled();
  });

  it("stores fetch error and returns false when delete fails", async () => {
    pendingTasksOrderMock.mockResolvedValue({ data: null, error: new Error("fetch failed") });
    pendingTasksDeleteEqMock.mockResolvedValue({ error: new Error("delete failed") });

    const { result } = renderHook(() => usePendingTasksData());

    await waitFor(() => {
      expect(result.current.error).toContain("fetch failed");
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.deleteTask("t-1");
    });

    expect(ok).toBe(false);
    expect(pendingTasksDeleteEqMock).toHaveBeenCalledWith("id", "t-1");
  });
});
