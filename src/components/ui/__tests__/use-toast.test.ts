import { describe, expect, it } from "vitest";

describe("components/ui/use-toast", () => {
  it("reexporta useToast e toast do hook", async () => {
    const uiModule = await import("@/components/ui/use-toast");
    const hookModule = await import("@/hooks/use-toast");

    expect(uiModule.useToast).toBe(hookModule.useToast);
    expect(uiModule.toast).toBe(hookModule.toast);
  });
});
