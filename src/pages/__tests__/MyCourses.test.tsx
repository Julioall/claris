import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyCourses from "@/pages/MyCourses";

const useAllCoursesDataMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/hooks/useAllCoursesData", () => ({
  useAllCoursesData: (...args: unknown[]) => useAllCoursesDataMock(...args),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/components/courses/CategoryHierarchy", () => ({
  CategoryHierarchy: ({
    courses,
    onUnfollow,
  }: {
    courses: Array<{ id: string }>;
    onUnfollow?: (courseId: string) => void;
  }) => (
    <div data-testid="category-hierarchy">
      cursos:{courses.length};editable:{onUnfollow ? "yes" : "no"}
    </div>
  ),
}));

describe("MyCourses page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ isEditMode: false });
    useAllCoursesDataMock.mockReturnValue({
      courses: [
        {
          id: "c-1",
          name: "Matematica Aplicada",
          short_name: "MAT",
          category: "Exatas",
          is_following: true,
          end_date: "2020-01-01T00:00:00.000Z",
          effective_end_date: "2099-01-01T00:00:00.000Z",
        },
        {
          id: "c-2",
          name: "Curso Encerrado",
          short_name: "OLD",
          category: "Legado",
          is_following: true,
          end_date: "2021-01-01T00:00:00.000Z",
        },
        {
          id: "c-3",
          name: "Nao seguido",
          short_name: "NO",
          category: "Teste",
          is_following: false,
          end_date: null,
        },
      ],
      isLoading: false,
      error: null,
      toggleFollow: vi.fn(),
      unfollowMultiple: vi.fn(),
      toggleAttendance: vi.fn(),
      toggleAttendanceMultiple: vi.fn(),
    });
  });

  it("shows loading indicator while data is loading", () => {
    useAllCoursesDataMock.mockReturnValue({
      courses: [],
      isLoading: true,
      error: null,
      toggleFollow: vi.fn(),
      unfollowMultiple: vi.fn(),
      toggleAttendance: vi.fn(),
      toggleAttendanceMultiple: vi.fn(),
    });

    const { container } = render(<MyCourses />);
    expect(container.querySelector('[data-testid="spinner"]')).toBeInTheDocument();
  });

  it("renders followed courses, including finished units", () => {
    render(<MyCourses />);

    expect(screen.getByText(/2 cursos em acompanhamento/i)).toBeInTheDocument();
    expect(screen.getByTestId("category-hierarchy")).toHaveTextContent("cursos:2");
    expect(screen.getByTestId("category-hierarchy")).toHaveTextContent("editable:no");
  });

  it("enables edit callbacks when edit mode is active", () => {
    useAuthMock.mockReturnValue({ isEditMode: true });

    render(<MyCourses />);

    expect(screen.getByTestId("category-hierarchy")).toHaveTextContent("editable:yes");
  });

  it("shows empty state when search has no matches", async () => {
    const user = userEvent.setup();
    render(<MyCourses />);

    await user.type(screen.getByPlaceholderText(/buscar curso/i), "inexistente");

    expect(screen.getByText(/nenhum curso em acompanhamento/i)).toBeInTheDocument();
  });
});
