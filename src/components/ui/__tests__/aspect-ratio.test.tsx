import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AspectRatio } from "@/components/ui/aspect-ratio";

describe("ui/aspect-ratio", () => {
  it("renders children with provided ratio", () => {
    const { container } = render(
      <AspectRatio ratio={16 / 9}>
        <div>Conteúdo</div>
      </AspectRatio>,
    );

    expect(container.textContent).toContain("Conteúdo");
  });
});
