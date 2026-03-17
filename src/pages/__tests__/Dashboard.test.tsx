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
    criticalStudents,
  }: {
    criticalStudents: Array<{ id: string }>;
  }) => <div data-testid="priority-list">{criticalStudents.length}</div>,
}));

vi.mock("@/components/dashboard/CourseOverview", () => ({
  CourseOverview: ({ courses }: { courses: Array<{ id: string }> }) => (
    <div data-testid="course-overview">{courses.length}</div>
  ),
}));

vi.mock("@/components/dashboard/ActivitiesToReview", () => ({
  ActivitiesToReview: ({ activities }: { activities: Array<{ id: string }> }) => (
    <div data-testid="activities-to-review">{activities.length}</div>
  ),
}));

vi.mock("@/components/dashboard/ActivityFeed", () => ({
  ActivityFeed: ({ items }: { items: Array<{ id: string }> }) => (
    <div data-testid="activity-feed">{items.length}</div>
  ),
}));

vi.mock("@/components/dashboard/ClarisSuggestions", () => ({
  ClarisSuggestions: () => <div data-testid="claris-suggestions" />,
}));

describe("Dashboard page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDashboardDataMock.mockReturnValue({
      summary: {
        pending_tasks: 3,
        overdue_tasks: 0,
        activities_to_review: 2,
        active_normal_students: 1,
        pending_submission_assignments: 1,
        pending_correction_assignments: 2,
        students_at_risk: 4,
        new_at_risk_this_week: 1,
      },
      criticalStudents: [{ id: "s-1" }],
      activitiesToReview: [{ id: "r-1" }, { id: "r-2" }],
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
      criticalStudents: [],
      activitiesToReview: [],
      activityFeed: [],
      isLoading: true,
    });

    useCoursesDataMock.mockReturnValue({
      courses: [],
      isLoading: false,
    });

    const { container } = render(<Dashboard />);
    expect(container.querySelector('[data-testid="spinner"]')).toBeInTheDocument();
  });

  it("renders dashboard sections when data is loaded", () => {
    render(<Dashboard />);

    expect(screen.getByText(/painel de monitoramento/i)).toBeInTheDocument();
    expect(screen.getByTestId("weekly-indicators")).toHaveTextContent("0");
    expect(screen.getByTestId("priority-list")).toHaveTextContent("1");
    expect(screen.getByTestId("activities-to-review")).toHaveTextContent("2");
    expect(screen.getByTestId("course-overview")).toHaveTextContent("1");
    expect(screen.getByTestId("activity-feed")).toHaveTextContent("1");
  });
});
