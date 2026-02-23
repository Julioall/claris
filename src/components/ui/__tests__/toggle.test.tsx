import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Toggle } from "@/components/ui/toggle";

describe("ui/toggle", () => {
  it("toggles pressed state when clicked", async () => {
    const user = userEvent.setup();

    render(
      <Toggle aria-label="marcar" defaultPressed={false}>
        Marcar
      </Toggle>,
    );

    const button = screen.getByRole("button", { name: /marcar/i });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("applies variant and size classes", () => {
    render(
      <Toggle aria-label="outline" variant="outline" size="sm">
        Outline
      </Toggle>,
    );

    const button = screen.getByRole("button", { name: /outline/i });
    expect(button.className).toContain("border");
    expect(button.className).toContain("h-9");
  });
});
