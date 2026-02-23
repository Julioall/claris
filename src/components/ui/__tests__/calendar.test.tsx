import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const dayPickerMock = vi.fn((props: Record<string, unknown>) => {
  const IconLeft = (props.components as { IconLeft: () => JSX.Element; IconRight: () => JSX.Element }).IconLeft;
  const IconRight = (props.components as { IconLeft: () => JSX.Element; IconRight: () => JSX.Element }).IconRight;

  return (
    <div data-testid="day-picker" data-show-outside-days={String(props.showOutsideDays)} className={String(props.className)}>
      <div data-testid="left-icon">
        <IconLeft />
      </div>
      <div data-testid="right-icon">
        <IconRight />
      </div>
      <span data-testid="custom-cell-class">{String((props.classNames as Record<string, string>).cell)}</span>
      <span data-testid="custom-day-class">{String((props.classNames as Record<string, string>).day)}</span>
    </div>
  );
});

vi.mock("react-day-picker", () => ({
  DayPicker: (props: Record<string, unknown>) => dayPickerMock(props),
}));

import { Calendar } from "@/components/ui/calendar";

describe("ui/calendar", () => {
  it("passa configurações padrão e renderiza ícones", () => {
    render(<Calendar className="calendar-custom" classNames={{ day: "my-day" }} />);

    const picker = screen.getByTestId("day-picker");
    expect(picker).toHaveAttribute("data-show-outside-days", "true");
    expect(picker.className).toContain("p-3");
    expect(picker.className).toContain("calendar-custom");

    expect(screen.getByTestId("left-icon").querySelector("svg")?.className.baseVal).toContain("h-4 w-4");
    expect(screen.getByTestId("right-icon").querySelector("svg")?.className.baseVal).toContain("h-4 w-4");
    expect(screen.getByTestId("custom-day-class").textContent).toContain("my-day");
  });

  it("permite sobrescrever showOutsideDays e classNames", () => {
    render(<Calendar showOutsideDays={false} classNames={{ cell: "my-cell" }} />);

    expect(screen.getByTestId("day-picker")).toHaveAttribute("data-show-outside-days", "false");
    expect(screen.getByTestId("custom-cell-class").textContent).toContain("my-cell");
  });
});
