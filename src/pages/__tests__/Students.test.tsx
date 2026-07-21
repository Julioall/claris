import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Students from "@/features/students/pages/StudentsPage";

const useStudentsDataMock = vi.fn();
const useSyncStudentsMutationMock = vi.fn();
const useCoursesDataMock = vi.fn();
const useAuthMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("@/features/students/hooks/useStudentsData", () => ({
  useStudentsData: (...args: unknown[]) => useStudentsDataMock(...args),
}));

vi.mock("@/features/students/hooks/useSyncStudentsMutation", () => ({
  useSyncStudentsMutation: () => useSyncStudentsMutationMock(),
}));

vi.mock("@/features/courses/hooks/useCoursesData", () => ({
  useCoursesData: () => useCoursesDataMock(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe("Students page", () => {
  let studentsFixture: Array<{
    id: string;
    name: string;
    email: string;
    riskLevel: string;
    enrollmentStatus: string;
    lastAccessAt: string;
    avatarUrl: string | null;
  }>;

  beforeEach(() => {
    vi.clearAllMocks();

    studentsFixture = [
      {
        id: "s-1",
        name: "Ana Silva",
        email: "ana@example.com",
        riskLevel: "risco",
        enrollmentStatus: "ativo",
        lastAccessAt: "2026-02-20T00:00:00.000Z",
        avatarUrl: null,
      },
    ];

    useStudentsDataMock.mockImplementation((params?: { searchQuery?: string; statusFilter?: string }) => {
      const normalizedSearch = (params?.searchQuery ?? "").trim().toLowerCase();
      const statusFilter = params?.statusFilter ?? "all";

      const filtered = studentsFixture.filter((student) => {
        const matchesStatus = statusFilter === "all" || student.enrollmentStatus === statusFilter;
        const matchesSearch =
          normalizedSearch.length === 0 ||
          student.name.toLowerCase().includes(normalizedSearch) ||
          student.email.toLowerCase().includes(normalizedSearch);

        return matchesStatus && matchesSearch;
      });

      return {
        students: filtered,
        totalCount: filtered.length,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      };
    });

    useCoursesDataMock.mockReturnValue({
      courses: [{ id: "c-1", name: "Curso 1", short_name: "C1" }],
    });

    useAuthMock.mockReturnValue({
      isSyncing: false,
      isOfflineMode: false,
    });

    useSyncStudentsMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it("shows loading state while students are loading", () => {
    useStudentsDataMock.mockReturnValue({
      students: [],
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    const { container } = render(<Students />);
    expect(container.querySelector('[data-testid="spinner"]')).toBeInTheDocument();
  });

  it("navigates to student profile when a row is clicked", async () => {
    const user = userEvent.setup();
    render(<Students />);

    await user.click(screen.getByText("Ana Silva"));

    expect(navigateMock).toHaveBeenCalledWith("/alunos/s-1");
  });

  it("filters students by enrollment status", async () => {
    const user = userEvent.setup();
    studentsFixture = [
      {
        id: "s-1",
        name: "Ana Silva",
        email: "ana@example.com",
        riskLevel: "risco",
        enrollmentStatus: "ativo",
        lastAccessAt: "2026-02-20T00:00:00.000Z",
        avatarUrl: null,
      },
      {
        id: "s-2",
        name: "Bruno Souza",
        email: "bruno@example.com",
        riskLevel: "normal",
        enrollmentStatus: "suspenso",
        lastAccessAt: "2026-02-18T00:00:00.000Z",
        avatarUrl: null,
      },
    ];

    render(<Students />);

    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(await screen.findByRole("option", { name: /suspenso/i }));

    await waitFor(() => {
      expect(screen.getByText("Bruno Souza")).toBeInTheDocument();
    });
    expect(screen.queryByText("Ana Silva")).not.toBeInTheDocument();
  });

  it("shows empty state when no students match search", async () => {
    const user = userEvent.setup();
    render(<Students />);

    await user.type(screen.getByPlaceholderText(/buscar por nome ou e-mail/i), "zzz");

    expect(screen.getByText(/nenhum aluno encontrado/i)).toBeInTheDocument();
  });
});
