import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeeklyIndicators } from "@/components/dashboard/WeeklyIndicators";

vi.mock("@/components/ui/StatCard", () => ({
  StatCard: ({
    title,
    value,
    subtitle,
    variant,
    trend,
  }: {
    title: string;
    value: number;
    subtitle?: string;
    variant?: string;
    trend?: { value: number };
  }) => (
    <div data-testid="stat-card">
      <span>{title}</span>
      <span>{value}</span>
      <span>{subtitle ?? "no-subtitle"}</span>
      <span>{variant ?? "default"}</span>
      <span>{trend ? `trend:${trend.value}` : "no-trend"}</span>
    </div>
  ),
}));

describe("WeeklyIndicators", () => {
  it("renders four stat cards with warning/trend states when thresholds are exceeded", () => {
    render(
      <WeeklyIndicators
        summary={{
          pending_tasks: 9,
          overdue_tasks: 2,
          students_at_risk: 4,
          new_at_risk_this_week: 3,
        }}
      />,
    );

    expect(screen.getByText(/indicadores da semana/i)).toBeInTheDocument();
    expect(screen.getAllByTestId("stat-card")).toHaveLength(4);
    expect(screen.getByText(/exigem atencao/i)).toBeInTheDocument();
    expect(screen.getByText("trend:3")).toBeInTheDocument();
  });

  it("uses default states when optional warning/trend conditions are not met", () => {
    render(
      <WeeklyIndicators
        summary={{
          pending_tasks: 1,
          overdue_tasks: 0,
          students_at_risk: 0,
          new_at_risk_this_week: 0,
        }}
      />,
    );

    expect(screen.getAllByText("no-trend").length).toBeGreaterThan(0);
    expect(screen.getAllByText("default").length).toBeGreaterThan(0);
  });
});
