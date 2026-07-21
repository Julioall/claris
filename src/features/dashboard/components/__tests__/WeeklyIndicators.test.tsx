import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeeklyIndicators } from "@/features/dashboard/components/WeeklyIndicators";

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
  it("renders five stat cards with operational monitoring signals", () => {
    render(
      <WeeklyIndicators
        summary={{
          todayEvents: 3,
          todayTasks: 2,
          activitiesToReview: 5,
          activeNormalStudents: 2,
          pendingSubmissionAssignments: 2,
          pendingCorrectionAssignments: 5,
          studentsAtRisk: 4,
          newAtRiskThisWeek: 3,
        }}
      />,
    );

    expect(screen.getByText(/sinais do monitoramento/i)).toBeInTheDocument();
    expect(screen.getAllByTestId("stat-card")).toHaveLength(5);
    expect(screen.getByText(/na agenda/i)).toBeInTheDocument();
    expect(screen.getByText(/com vencimento hoje/i)).toBeInTheDocument();
    expect(screen.getByText(/envio pendente: 2 • correção pendente: 5/i)).toBeInTheDocument();
    expect(screen.getByText("trend:3")).toBeInTheDocument();
  });

  it("uses default states when optional warning/trend conditions are not met", () => {
    render(
      <WeeklyIndicators
        summary={{
          todayEvents: 0,
          todayTasks: 0,
          activitiesToReview: 0,
          activeNormalStudents: 0,
          pendingSubmissionAssignments: 0,
          pendingCorrectionAssignments: 0,
          studentsAtRisk: 0,
          newAtRiskThisWeek: 0,
        }}
      />,
    );

    expect(screen.getAllByText("no-trend").length).toBeGreaterThan(0);
    expect(screen.getAllByText("pending").length).toBeGreaterThan(0);
    expect(screen.getAllByText("risk").length).toBeGreaterThan(0);
    expect(screen.getAllByText("warning").length).toBeGreaterThan(0);
    expect(screen.getAllByText("success").length).toBeGreaterThan(0);
  });
});
