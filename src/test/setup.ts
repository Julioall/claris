import "@testing-library/jest-dom";
import { afterAll, beforeAll, vi } from "vitest";

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
    const message = String(args[0] ?? "");
    if (message.includes("not wrapped in act")) return;
  });
});

afterAll(() => {
  consoleErrorSpy?.mockRestore();
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  writable: true,
  value: ResizeObserverMock,
});

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}

if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:mock";
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => {};
}
