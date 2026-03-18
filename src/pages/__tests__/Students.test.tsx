import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Students from "@/pages/Students";

const useStudentsDataMock = vi.fn();
const useCoursesDataMock = vi.fn();
const useAuthMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("@/hooks/useStudentsData", () => ({
  useStudentsData: (...args: unknown[]) => useStudentsDataMock(...args),
}));

vi.mock("@/hooks/useCoursesData", () => ({
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
  beforeEach(() => {
    vi.clearAllMocks();

    useStudentsDataMock.mockReturnValue({
      students: [
        {
          id: "s-1",
          full_name: "Ana Silva",
          email: "ana@example.com",
          current_risk_level: "risco",
          enrollment_status: "ativo",
          last_access: "2026-02-20T00:00:00.000Z",
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    useCoursesDataMock.mockReturnValue({
      courses: [{ id: "c-1", name: "Curso 1", short_name: "C1" }],
    });

    useAuthMock.mockReturnValue({
      syncStudentsIncremental: vi.fn(),
      isSyncing: false,
      isOfflineMode: false,
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
    useStudentsDataMock.mockReturnValue({
      students: [
        {
          id: "s-1",
          full_name: "Ana Silva",
          email: "ana@example.com",
          current_risk_level: "risco",
          enrollment_status: "ativo",
          last_access: "2026-02-20T00:00:00.000Z",
        },
        {
          id: "s-2",
          full_name: "Bruno Souza",
          email: "bruno@example.com",
          current_risk_level: "normal",
          enrollment_status: "suspenso",
          last_access: "2026-02-18T00:00:00.000Z",
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
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
