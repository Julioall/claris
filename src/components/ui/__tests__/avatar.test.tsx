import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

describe("ui/avatar", () => {
  it("renders avatar with image and fallback", () => {
    render(
      <Avatar>
        <AvatarImage src="https://example.com/avatar.png" alt="Usuário" />
        <AvatarFallback>JS</AvatarFallback>
      </Avatar>,
    );

    expect(screen.queryByAltText("Usuário")).not.toBeInTheDocument();
    expect(screen.getByText("JS")).toBeInTheDocument();
  });

  it("accepts custom className on root", () => {
    const { container } = render(
      <Avatar className="h-12 w-12">
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );

    expect(container.firstChild).toHaveClass("h-12", "w-12");
  });
});
