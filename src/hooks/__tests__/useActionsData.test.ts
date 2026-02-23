import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useActionsData } from "@/hooks/useActionsData";

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const orderMock = vi.fn();
const updateMock = vi.fn();
const updateEqMock = vi.fn();
const deleteMock = vi.fn();
const deleteEqMock = vi.fn();
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

const actionsRows = [
  {
    id: "a-1",
    student_id: "s-1",
    course_id: "c-1",
    user_id: "user-1",
    action_type: "contato",
    description: "Contato por email",
    status: "planejada",
    scheduled_date: "2026-02-28T00:00:00.000Z",
    completed_at: null,
    created_at: "2026-02-20T09:00:00.000Z",
    updated_at: "2026-02-20T09:00:00.000Z",
    students: { id: "s-1", full_name: "Ana Silva" },
    courses: { id: "c-1", short_name: "MAT" },
  },
  {
    id: "a-2",
    student_id: "s-2",
    course_id: null,
    user_id: "user-1",
    action_type: "outro",
    description: "Acompanhamento geral",
    status: "concluida",
    scheduled_date: null,
    completed_at: "2026-02-21T09:00:00.000Z",
    created_at: null,
    updated_at: null,
    students: null,
    courses: null,
  },
];

function setupActionsChain() {
  selectMock.mockReturnValue({ eq: eqMock });
  eqMock.mockReturnValue({ order: orderMock });
  updateMock.mockReturnValue({ eq: updateEqMock });
  deleteMock.mockReturnValue({ eq: deleteEqMock });

  fromMock.mockImplementation((table: string) => {
    if (table === "actions") {
      return {
        select: selectMock,
        update: updateMock,
        delete: deleteMock,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("useActionsData", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: "user-1" } });
    setupActionsChain();

    orderMock.mockResolvedValue({ data: actionsRows, error: null });
    updateEqMock.mockResolvedValue({ error: null });
    deleteEqMock.mockResolvedValue({ error: null });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("loads and formats actions with relations", async () => {
    const { result } = renderHook(() => useActionsData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.actions).toHaveLength(2);
    expect(result.current.actions[0]).toMatchObject({
      id: "a-1",
      student: { id: "s-1", full_name: "Ana Silva" },
      course: { id: "c-1", short_name: "MAT" },
    });
    expect(result.current.actions[1]).toMatchObject({
      id: "a-2",
      created_at: expect.any(String),
      course: undefined,
      student: undefined,
    });
  });

  it("marks action as completed and refetches", async () => {
    const { result } = renderHook(() => useActionsData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.markAsCompleted("a-1");
    });

    expect(ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "concluida",
        completed_at: expect.any(String),
      }),
    );
    expect(updateEqMock).toHaveBeenCalledWith("id", "a-1");
    expect(orderMock).toHaveBeenCalledTimes(2);
  });

  it("returns false when delete action fails", async () => {
    deleteEqMock.mockResolvedValue({ error: new Error("cannot delete") });

    const { result } = renderHook(() => useActionsData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.deleteAction("a-2");
    });

    expect(ok).toBe(false);
    expect(deleteEqMock).toHaveBeenCalledWith("id", "a-2");
  });

  it("returns empty data immediately when user is not authenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });

    const { result } = renderHook(() => useActionsData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.actions).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
