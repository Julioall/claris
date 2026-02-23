import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Students from "@/pages/Students";

const useStudentsDataMock = vi.fn();
const useCoursesDataMock = vi.fn();
const navigateMock = vi.fn();
const toastMock = vi.fn();
const rpcMock = vi.fn();
const refetchMock = vi.fn();

vi.mock("@/hooks/useStudentsData", () => ({
  useStudentsData: (...args: unknown[]) => useStudentsDataMock(...args),
}));

vi.mock("@/hooks/useCoursesData", () => ({
  useCoursesData: () => useCoursesDataMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
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
    refetchMock.mockResolvedValue(undefined);
    rpcMock.mockResolvedValue({ data: 3, error: null });

    useStudentsDataMock.mockReturnValue({
      students: [
        {
          id: "s-1",
          full_name: "Ana Silva",
          email: "ana@example.com",
          current_risk_level: "risco",
          enrollment_status: "ativo",
          pending_tasks_count: 2,
          last_access: "2026-02-20T00:00:00.000Z",
          last_action_date: "2026-02-19T00:00:00.000Z",
        },
      ],
      isLoading: false,
      error: null,
      refetch: refetchMock,
    });

    useCoursesDataMock.mockReturnValue({
      courses: [{ id: "c-1", name: "Curso 1", short_name: "C1" }],
    });
  });

  it("shows loading state while students are loading", () => {
    useStudentsDataMock.mockReturnValue({
      students: [],
      isLoading: true,
      error: null,
      refetch: refetchMock,
    });

    const { container } = render(<Students />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("navigates to student profile when a row is clicked", async () => {
    const user = userEvent.setup();
    render(<Students />);

    await user.click(screen.getByText("Ana Silva"));

    expect(navigateMock).toHaveBeenCalledWith("/alunos/s-1");
  });

  it("recalculates risk successfully and refetches students", async () => {
    const user = userEvent.setup();
    render(<Students />);

    await user.click(screen.getByRole("button", { name: /atualizar risco/i }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith("update_course_students_risk", {
        p_course_id: "c-1",
      });
    });
    expect(refetchMock).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/risco atualizado/i),
      }),
    );
  });

  it("shows empty state when no students match search", async () => {
    const user = userEvent.setup();
    render(<Students />);

    await user.type(screen.getByPlaceholderText(/buscar por nome ou e-mail/i), "zzz");

    expect(screen.getByText(/nenhum aluno encontrado/i)).toBeInTheDocument();
  });
});
