import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

describe("ui/hover-card", () => {
  it("renders trigger and opens content on hover", async () => {
    const user = userEvent.setup();

    render(
      <HoverCard>
        <HoverCardTrigger>Detalhes</HoverCardTrigger>
        <HoverCardContent>Conteúdo do hover card</HoverCardContent>
      </HoverCard>,
    );

    await user.hover(screen.getByText("Detalhes"));
    expect(await screen.findByText("Conteúdo do hover card")).toBeInTheDocument();
  });
});
