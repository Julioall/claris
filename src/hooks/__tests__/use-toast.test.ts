import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("hooks/use-toast", () => {
  it("aplica reducer para add/update/dismiss/remove", async () => {
    const { reducer } = await import("@/hooks/use-toast");

    const initial = { toasts: [] as Array<{ id: string; open?: boolean; title?: string }> };
    const added = reducer(initial, { type: "ADD_TOAST", toast: { id: "1", title: "A", open: true } } as never);
    expect(added.toasts).toHaveLength(1);

    const updated = reducer(added, { type: "UPDATE_TOAST", toast: { id: "1", title: "B" } } as never);
    expect(updated.toasts[0].title).toBe("B");

    const dismissed = reducer(updated, { type: "DISMISS_TOAST", toastId: "1" } as never);
    expect(dismissed.toasts[0].open).toBe(false);

    const removedOne = reducer(dismissed, { type: "REMOVE_TOAST", toastId: "1" } as never);
    expect(removedOne.toasts).toHaveLength(0);

    const removedAll = reducer(
      { toasts: [{ id: "x", open: true }, { id: "y", open: true }] },
      { type: "REMOVE_TOAST" } as never,
    );
    expect(removedAll.toasts).toEqual([]);
  });

  it("expõe API de toast via hook com update e dismiss", async () => {
    const mod = await import("@/hooks/use-toast");

    const { result } = renderHook(() => mod.useToast());
    expect(result.current.toasts).toHaveLength(0);

    let controls: ReturnType<typeof mod.toast>;

    act(() => {
      controls = result.current.toast({ title: "Primeiro", description: "desc" });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].title).toBe("Primeiro");
    expect(result.current.toasts[0].open).toBe(true);

    act(() => {
      controls.update({ id: controls.id, title: "Atualizado", open: true });
    });

    expect(result.current.toasts[0].title).toBe("Atualizado");

    act(() => {
      controls.dismiss();
    });

    expect(result.current.toasts[0].open).toBe(false);

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.toasts[0].open).toBe(false);

    act(() => {
      result.current.toasts[0].onOpenChange?.(false);
    });

    expect(result.current.toasts[0].open).toBe(false);
  });
});
