import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataCleanupCard } from "@/components/settings/DataCleanupCard";

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const toastMock = vi.fn();

let deleteErrors = new Set<string>();
let deleteCalls: string[] = [];

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

describe("DataCleanupCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteErrors = new Set<string>();
    deleteCalls = [];

    useAuthMock.mockReturnValue({
      setCourses: vi.fn(),
    });

    fromMock.mockImplementation((table: string) => ({
      delete: () => ({
        neq: async () => {
          deleteCalls.push(table);
          if (deleteErrors.has(table)) {
            return { error: { message: `fail ${table}` } };
          }
          return { error: null };
        },
      }),
    }));
  });

  it("selects and deselects all cleanup options", async () => {
    const user = userEvent.setup();
    render(<DataCleanupCard />);

    const cleanupButton = screen.getByRole("button", {
      name: /Limpar dados selecionados/i,
    });
    expect(cleanupButton).toHaveTextContent("(0)");
    expect(cleanupButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Selecionar tudo/i }));
    expect(cleanupButton).toHaveTextContent("(13)");
    expect(cleanupButton).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /Desmarcar tudo/i }));
    expect(cleanupButton).toHaveTextContent("(0)");
    expect(cleanupButton).toBeDisabled();
  });

  it("executes cleanup and clears courses cache when courses option is selected", async () => {
    const user = userEvent.setup();
    const setCoursesMock = vi.fn();
    useAuthMock.mockReturnValue({ setCourses: setCoursesMock });

    render(<DataCleanupCard />);

    await user.click(screen.getByLabelText(/^Cursos$/i));
    await user.click(
      screen.getByRole("button", { name: /Limpar dados selecionados/i }),
    );
    await user.click(screen.getByRole("button", { name: /Sim, limpar dados/i }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/conclu/i),
        }),
      );
    });

    expect(setCoursesMock).toHaveBeenCalledWith([]);
    expect(deleteCalls).toEqual([
      "user_courses",
      "student_courses",
      "student_course_grades",
      "courses",
    ]);
  });

  it("shows destructive toast when one selected cleanup option fails", async () => {
    const user = userEvent.setup();
    deleteErrors.add("user_courses");

    render(<DataCleanupCard />);

    await user.click(screen.getByLabelText(/^Meus cursos$/i));
    await user.click(
      screen.getByRole("button", { name: /Limpar dados selecionados/i }),
    );
    await user.click(screen.getByRole("button", { name: /Sim, limpar dados/i }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });

    const lastToastCall = toastMock.mock.calls.at(-1)?.[0] as
      | { description?: string; variant?: string; title?: string }
      | undefined;

    expect(lastToastCall?.title).toMatch(/parcial/i);
    expect(lastToastCall?.variant).toBe("destructive");
    expect(lastToastCall?.description).toContain("Meus cursos: fail user_courses");
  });
});
