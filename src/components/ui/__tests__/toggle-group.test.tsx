import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

describe("ui/toggle-group", () => {
  it("selects one item in single mode", async () => {
    const user = userEvent.setup();

    render(
      <ToggleGroup type="single" aria-label="formato">
        <ToggleGroupItem value="bold" aria-label="bold">
          B
        </ToggleGroupItem>
        <ToggleGroupItem value="italic" aria-label="italic">
          I
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    const bold = screen.getByRole("radio", { name: /bold/i });
    const italic = screen.getByRole("radio", { name: /italic/i });

    await user.click(bold);
    expect(bold).toHaveAttribute("data-state", "on");

    await user.click(italic);
    expect(italic).toHaveAttribute("data-state", "on");
    expect(bold).toHaveAttribute("data-state", "off");
  });

  it("inherits variant and size from group context", () => {
    render(
      <ToggleGroup type="single" variant="outline" size="sm" aria-label="contexto">
        <ToggleGroupItem value="a" aria-label="a">
          A
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    const button = screen.getByRole("radio", { name: /a/i });
    expect(button.className).toContain("border");
    expect(button.className).toContain("h-9");
  });
});
