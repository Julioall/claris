import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Slider } from "@/components/ui/slider";

describe("ui/slider", () => {
  it("renders slider root and thumb", () => {
    const { container } = render(<Slider defaultValue={[40]} max={100} step={1} />);

    expect(screen.getByRole("slider")).toBeInTheDocument();
    expect(container.querySelector("[data-orientation]")).toBeTruthy();
  });

  it("applies custom className", () => {
    const { container } = render(<Slider className="mt-2" defaultValue={[20]} />);

    expect(container.firstChild).toHaveClass("mt-2");
  });
});
