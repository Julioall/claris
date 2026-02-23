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
  it("renders five stat cards with warning/trend states when thresholds are exceeded", () => {
    render(
      <WeeklyIndicators
        summary={{
          completed_actions: 8,
          pending_actions: 5,
          overdue_actions: 2,
          pending_tasks: 9,
          students_at_risk: 4,
          new_at_risk_this_week: 3,
          students_without_contact: 1,
        }}
      />,
    );

    expect(screen.getByText(/indicadores da semana/i)).toBeInTheDocument();
    expect(screen.getAllByTestId("stat-card")).toHaveLength(5);
    expect(screen.getByText(/2 atrasadas/i)).toBeInTheDocument();
    expect(screen.getByText("trend:3")).toBeInTheDocument();
  });

  it("uses default states when optional warning/trend conditions are not met", () => {
    render(
      <WeeklyIndicators
        summary={{
          completed_actions: 1,
          pending_actions: 0,
          overdue_actions: 0,
          pending_tasks: 1,
          students_at_risk: 0,
          new_at_risk_this_week: 0,
          students_without_contact: 0,
        }}
      />,
    );

    expect(screen.getAllByText("no-trend").length).toBeGreaterThan(0);
    expect(screen.getAllByText("default").length).toBeGreaterThan(0);
  });
});
