import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Dashboard from "@/pages/Dashboard";

const useDashboardDataMock = vi.fn();
const useCoursesDataMock = vi.fn();

vi.mock("@/hooks/useDashboardData", () => ({
  useDashboardData: (...args: unknown[]) => useDashboardDataMock(...args),
}));

vi.mock("@/hooks/useCoursesData", () => ({
  useCoursesData: (...args: unknown[]) => useCoursesDataMock(...args),
}));

vi.mock("@/components/dashboard/WeeklyIndicators", () => ({
  WeeklyIndicators: ({ summary }: { summary: { pending_actions: number } }) => (
    <div data-testid="weekly-indicators">{summary.pending_actions}</div>
  ),
}));

vi.mock("@/components/dashboard/PriorityList", () => ({
  PriorityList: ({
    overdueActions,
  }: {
    overdueActions: Array<{ id: string }>;
  }) => <div data-testid="priority-list">{overdueActions.length}</div>,
}));

vi.mock("@/components/dashboard/CourseOverview", () => ({
  CourseOverview: ({ courses }: { courses: Array<{ id: string }> }) => (
    <div data-testid="course-overview">{courses.length}</div>
  ),
}));

vi.mock("@/components/dashboard/ActivityFeed", () => ({
  ActivityFeed: ({ items }: { items: Array<{ id: string }> }) => (
    <div data-testid="activity-feed">{items.length}</div>
  ),
}));

describe("Dashboard page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDashboardDataMock.mockReturnValue({
      summary: {
        completed_actions: 1,
        pending_actions: 2,
        overdue_actions: 0,
        pending_tasks: 3,
        students_at_risk: 4,
        new_at_risk_this_week: 1,
        students_without_contact: 0,
      },
      overdueActions: [{ id: "o-1" }],
      upcomingTasks: [{ id: "u-1" }],
      criticalStudents: [{ id: "s-1" }],
      activityFeed: [{ id: "a-1" }],
      isLoading: false,
    });
    useCoursesDataMock.mockReturnValue({
      courses: [{ id: "c-1", name: "Curso 1" }],
      isLoading: false,
    });
  });

  it("shows loading state while dashboard data is loading", () => {
    useDashboardDataMock.mockReturnValue({
      summary: null,
      overdueActions: [],
      upcomingTasks: [],
      criticalStudents: [],
      activityFeed: [],
      isLoading: true,
    });

    useCoursesDataMock.mockReturnValue({
      courses: [],
      isLoading: false,
    });

    const { container } = render(<Dashboard />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders dashboard sections when data is loaded", () => {
    render(<Dashboard />);

    expect(screen.getByText(/resumo da semana/i)).toBeInTheDocument();
    expect(screen.getByTestId("weekly-indicators")).toHaveTextContent("2");
    expect(screen.getByTestId("priority-list")).toHaveTextContent("1");
    expect(screen.getByTestId("course-overview")).toHaveTextContent("1");
    expect(screen.getByTestId("activity-feed")).toHaveTextContent("1");
  });
});
