import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

describe("ui/radio-group", () => {
  it("renderiza grupo e itens com classes base", () => {
    render(
      <RadioGroup aria-label="preferência" className="custom-group" defaultValue="a">
        <RadioGroupItem value="a" aria-label="A" className="custom-item-a" />
        <RadioGroupItem value="b" aria-label="B" className="custom-item-b" />
      </RadioGroup>,
    );

    const group = screen.getByRole("radiogroup", { name: /preferência/i });
    expect(group.className).toContain("grid");
    expect(group.className).toContain("custom-group");

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0].className).toContain("aspect-square");
    expect(radios[0].className).toContain("custom-item-a");
    expect(radios[1].className).toContain("custom-item-b");
  });

  it("alterna seleção ao clicar nos itens", async () => {
    const user = userEvent.setup();

    render(
      <RadioGroup aria-label="opções" defaultValue="a">
        <RadioGroupItem value="a" aria-label="Opção A" />
        <RadioGroupItem value="b" aria-label="Opção B" />
      </RadioGroup>,
    );

    const optionA = screen.getByRole("radio", { name: /opção a/i });
    const optionB = screen.getByRole("radio", { name: /opção b/i });

    expect(optionA).toHaveAttribute("aria-checked", "true");
    expect(optionB).toHaveAttribute("aria-checked", "false");

    await user.click(optionB);

    expect(optionA).toHaveAttribute("aria-checked", "false");
    expect(optionB).toHaveAttribute("aria-checked", "true");
  });
});
