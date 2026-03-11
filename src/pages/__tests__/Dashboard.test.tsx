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
  WeeklyIndicators: ({ summary }: { summary: { overdue_tasks: number } }) => (
    <div data-testid="weekly-indicators">{summary.overdue_tasks}</div>
  ),
}));

vi.mock("@/components/dashboard/PriorityList", () => ({
  PriorityList: ({
    overdueTasks,
  }: {
    overdueTasks: Array<{ id: string }>;
  }) => <div data-testid="priority-list">{overdueTasks.length}</div>,
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
        pending_tasks: 3,
        overdue_tasks: 1,
        students_at_risk: 4,
        new_at_risk_this_week: 1,
      },
      overdueTasks: [{ id: "o-1" }],
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
      overdueTasks: [],
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
    expect(screen.getByTestId("weekly-indicators")).toHaveTextContent("1");
    expect(screen.getByTestId("priority-list")).toHaveTextContent("1");
    expect(screen.getByTestId("course-overview")).toHaveTextContent("1");
    expect(screen.getByTestId("activity-feed")).toHaveTextContent("1");
  });
});
