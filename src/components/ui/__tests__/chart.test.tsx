import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChartContainer,
  ChartLegendContent,
  ChartStyle,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  Tooltip: ({ children }: { children?: React.ReactNode }) => <div data-testid="tooltip">{children}</div>,
  Legend: ({ children }: { children?: React.ReactNode }) => <div data-testid="legend">{children}</div>,
}));

function IconMock() {
  return <svg data-testid="icon-mock" />;
}

describe("ui/chart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when tooltip content is used outside ChartContainer", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      render(<ChartTooltipContent active payload={[{ name: "revenue", dataKey: "revenue", value: 10 }]} />),
    ).toThrow(/useChart must be used within a <ChartContainer \/>/i);

    consoleErrorSpy.mockRestore();
  });

  it("renders ChartContainer with generated CSS variables", () => {
    const config: ChartConfig = {
      revenue: { label: "Receita", color: "#123456" },
      expenses: { label: "Despesas", theme: { light: "#abcdef", dark: "#fedcba" } },
    };

    const { container } = render(
      <ChartContainer id="sales" config={config}>
        <div>chart child</div>
      </ChartContainer>,
    );

    const root = container.querySelector("[data-chart='chart-sales']");
    expect(root).toBeInTheDocument();
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
    expect(screen.getByText("chart child")).toBeInTheDocument();

    const styleTag = container.querySelector("style");
    expect(styleTag?.textContent).toContain("[data-chart=chart-sales]");
    expect(styleTag?.textContent).toContain("--color-revenue: #123456");
    expect(styleTag?.textContent).toContain("--color-expenses: #abcdef");
    expect(styleTag?.textContent).toContain("--color-expenses: #fedcba");
  });

  it("returns null in ChartStyle when config has no colors", () => {
    const { container } = render(
      <ChartStyle
        id="empty"
        config={{
          metric: { label: "Métrica" },
        }}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders tooltip label and formatted value", () => {
    const config: ChartConfig = {
      revenue: { label: "Receita" },
    };

    render(
      <ChartContainer config={config}>
        <ChartTooltipContent
          active
          label="revenue"
          payload={[
            {
              name: "revenue",
              dataKey: "revenue",
              value: 1234,
              color: "#f00",
              payload: {},
            },
          ]}
        />
      </ChartContainer>,
    );

    expect(screen.getAllByText("Receita").length).toBeGreaterThan(0);
    expect(screen.getByText(/1[.,]234/)).toBeInTheDocument();
  });

  it("renders tooltip custom formatter and legend with icon", () => {
    const config: ChartConfig = {
      revenue: { label: "Receita", icon: IconMock },
    };

    render(
      <ChartContainer config={config}>
        <>
          <ChartTooltipContent
            active
            payload={[
              {
                name: "revenue",
                dataKey: "revenue",
                value: 99,
                color: "#0f0",
                payload: {},
              },
            ]}
            formatter={() => <span>formatado</span>}
          />
          <ChartLegendContent
            payload={[
              {
                value: "revenue",
                dataKey: "revenue",
                color: "#0f0",
              },
            ]}
          />
        </>
      </ChartContainer>,
    );

    expect(screen.getByText("formatado")).toBeInTheDocument();
    expect(screen.getByTestId("icon-mock")).toBeInTheDocument();
    expect(screen.getAllByText("Receita").length).toBeGreaterThan(0);
  });

  it("returns null in legend content when payload is empty", () => {
    const config: ChartConfig = {
      revenue: { label: "Receita" },
    };

    const { container } = render(
      <ChartContainer config={config}>
        <ChartLegendContent payload={[]} />
      </ChartContainer>,
    );

    expect(container.querySelector("[data-testid='icon-mock']")).not.toBeInTheDocument();
    expect(screen.queryByText("Receita")).not.toBeInTheDocument();
  });
});
