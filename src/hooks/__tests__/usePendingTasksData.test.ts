import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { usePendingTasksData } from "@/hooks/usePendingTasksData";

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const selectMock = vi.fn();
const orMock = vi.fn();
const orderMock = vi.fn();
const updateMock = vi.fn();
const updateEqMock = vi.fn();
const deleteMock = vi.fn();
const deleteEqMock = vi.fn();
const insertMock = vi.fn();
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

const pendingTasksRows = [
  {
    id: "t-1",
    student_id: "s-1",
    course_id: "c-1",
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
    created_at: "2026-02-20T10:00:00.000Z",
    updated_at: "2026-02-20T10:00:00.000Z",
    students: { id: "s-1", full_name: "Ana Silva" },
    courses: { id: "c-1", short_name: "MAT" },
  },
  {
    id: "t-2",
    student_id: null,
    course_id: "c-1",
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
    created_at: null,
    updated_at: null,
    students: null,
    courses: { id: "c-1", short_name: "MAT" },
  },
];

function setupPendingTasksChain() {
  selectMock.mockReturnValue({ or: orMock });
  orMock.mockReturnValue({ order: orderMock });
  updateMock.mockReturnValue({ eq: updateEqMock });
  deleteMock.mockReturnValue({ eq: deleteEqMock });

  fromMock.mockImplementation((table: string) => {
    if (table === "pending_tasks") {
      return {
        select: selectMock,
        update: updateMock,
        delete: deleteMock,
        insert: insertMock,
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
    orderMock.mockResolvedValue({ data: pendingTasksRows, error: null });
    updateEqMock.mockResolvedValue({ error: null });
    deleteEqMock.mockResolvedValue({ error: null });
    insertMock.mockResolvedValue({ error: null });
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
    });
    expect(result.current.tasks[1]).toMatchObject({
      task_type: "interna",
      status: "aberta",
      priority: "media",
    });
    expect(result.current.courses).toEqual([{ id: "c-1", short_name: "MAT" }]);
  });

  it("marks a task as resolved and refetches data", async () => {
    const { result } = renderHook(() => usePendingTasksData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.markAsResolved("t-1");
    });

    expect(ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "resolvida",
        completed_at: expect.any(String),
      }),
    );
    expect(updateEqMock).toHaveBeenCalledWith("id", "t-1");
    expect(orderMock).toHaveBeenCalledTimes(2);
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
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("stores fetch error and returns false when delete fails", async () => {
    orderMock.mockResolvedValue({ data: null, error: new Error("fetch failed") });
    deleteEqMock.mockResolvedValue({ error: new Error("delete failed") });

    const { result } = renderHook(() => usePendingTasksData());

    await waitFor(() => {
      expect(result.current.error).toContain("fetch failed");
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.deleteTask("t-1");
    });

    expect(ok).toBe(false);
    expect(deleteEqMock).toHaveBeenCalledWith("id", "t-1");
  });
});
