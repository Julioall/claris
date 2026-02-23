import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";

const useThemeMock = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => useThemeMock(),
}));

vi.mock("sonner", () => ({
  Toaster: ({ theme, className }: { theme: string; className?: string }) => (
    <div data-testid="sonner-toaster" data-theme={theme} className={className} />
  ),
  toast: vi.fn(),
}));

describe("ui/sonner", () => {
  it("passes current theme to Sonner toaster", () => {
    useThemeMock.mockReturnValue({ theme: "dark" });

    render(<Toaster />);

    const toaster = screen.getByTestId("sonner-toaster");
    expect(toaster).toHaveAttribute("data-theme", "dark");
    expect(toaster).toHaveClass("toaster", "group");
  });

  it("falls back to system theme when no explicit theme exists", () => {
    useThemeMock.mockReturnValue({});

    render(<Toaster />);

    expect(screen.getByTestId("sonner-toaster")).toHaveAttribute("data-theme", "system");
  });
});
