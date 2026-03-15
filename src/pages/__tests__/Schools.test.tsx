import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Schools from "@/pages/Schools";

const useAllCoursesDataMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/hooks/useAllCoursesData", () => ({
  useAllCoursesData: (...args: unknown[]) => useAllCoursesDataMock(...args),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/components/schools/SchoolHierarchy", () => ({
  SchoolHierarchy: ({
    courses,
    onToggleFollow,
  }: {
    courses: Array<{ id: string }>;
    onToggleFollow?: (courseId: string) => void;
  }) => (
    <div data-testid="school-hierarchy">
      cursos:{courses.length};editable:{onToggleFollow ? "yes" : "no"}
    </div>
  ),
}));

describe("Schools page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ isEditMode: false });
    useAllCoursesDataMock.mockReturnValue({
      courses: [
        {
          id: "c-1",
          name: "Fisica",
          short_name: "FIS",
          category: "Exatas",
        },
        {
          id: "c-2",
          name: "Historia",
          short_name: "HIS",
          category: "Humanas",
        },
      ],
      isLoading: false,
      error: null,
      toggleFollow: vi.fn(),
      toggleIgnore: vi.fn(),
      toggleIgnoreMultiple: vi.fn(),
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
      toggleIgnore: vi.fn(),
      toggleIgnoreMultiple: vi.fn(),
      toggleAttendance: vi.fn(),
      toggleAttendanceMultiple: vi.fn(),
    });

    const { container } = render(<Schools />);
    expect(container.querySelector('[data-testid="spinner"]')).toBeInTheDocument();
  });

  it("renders school hierarchy and total count", () => {
    render(<Schools />);

    expect(screen.getByText(/cursos dispon/i)).toBeInTheDocument();
    expect(screen.getByTestId("school-hierarchy")).toHaveTextContent("cursos:2");
    expect(screen.getByTestId("school-hierarchy")).toHaveTextContent("editable:no");
  });

  it("passes edit callbacks when edit mode is enabled", () => {
    useAuthMock.mockReturnValue({ isEditMode: true });

    render(<Schools />);

    expect(screen.getByTestId("school-hierarchy")).toHaveTextContent("editable:yes");
  });

  it("shows empty state when search returns no matches", async () => {
    const user = userEvent.setup();
    render(<Schools />);

    await user.type(
      screen.getByPlaceholderText(/buscar escola, curso ou disciplina/i),
      "inexistente",
    );

    expect(screen.getByText(/nenhum curso encontrado/i)).toBeInTheDocument();
  });
});
