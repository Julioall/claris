import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useIsMobile } from "@/hooks/use-mobile";

type MatchMediaListener = () => void;

function setupMatchMediaMock() {
  let listener: MatchMediaListener | null = null;
  const addEventListenerMock = vi.fn((event: string, cb: MatchMediaListener) => {
    if (event === "change") listener = cb;
  });
  const removeEventListenerMock = vi.fn((event: string, cb: MatchMediaListener) => {
    if (event === "change" && listener === cb) listener = null;
  });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: "(max-width: 767px)",
      onchange: null,
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  return {
    addEventListenerMock,
    removeEventListenerMock,
    triggerChange: () => listener?.(),
  };
}

function setInnerWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  });
}

describe("useIsMobile", () => {
  it("returns true when viewport is below mobile breakpoint", () => {
    setInnerWidth(640);
    setupMatchMediaMock();

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it("returns false when viewport is above mobile breakpoint", () => {
    setInnerWidth(1024);
    setupMatchMediaMock();

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it("updates value when matchMedia change listener is triggered and cleans up listener on unmount", () => {
    setInnerWidth(1024);
    const { addEventListenerMock, removeEventListenerMock, triggerChange } =
      setupMatchMediaMock();

    const { result, unmount } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    expect(addEventListenerMock).toHaveBeenCalledTimes(1);

    setInnerWidth(600);
    act(() => {
      triggerChange();
    });

    expect(result.current).toBe(true);

    unmount();
    expect(removeEventListenerMock).toHaveBeenCalledTimes(1);
  });
});
