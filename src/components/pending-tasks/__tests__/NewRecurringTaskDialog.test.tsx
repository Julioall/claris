import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewRecurringTaskDialog } from "@/components/pending-tasks/NewRecurringTaskDialog";

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const rpcMock = vi.fn();
const userCoursesSelectMock = vi.fn();
const userCoursesEqMock = vi.fn();
const studentCoursesSelectMock = vi.fn();
const studentCoursesEqMock = vi.fn();
const recurrenceInsertMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect?: (date: Date) => void }) => (
    <button
      data-testid="mock-calendar"
      type="button"
      onClick={() => onSelect?.(new Date("2026-03-10T00:00:00.000Z"))}
    >
      choose-date
    </button>
  ),
}));

function renderDialog(props: Partial<ComponentProps<typeof NewRecurringTaskDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  render(
    <NewRecurringTaskDialog
      open
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
      {...props}
    />,
  );

  return { onOpenChange, onSuccess };
}

async function pickComboboxOption(index: number, optionName: RegExp) {
  const user = userEvent.setup();
  const combobox = screen.getAllByRole("combobox")[index];
  await user.click(combobox);
  await user.click(await screen.findByRole("option", { name: optionName }));
}

describe("NewRecurringTaskDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: "user-1" } });

    fromMock.mockImplementation((table: string) => {
      if (table === "user_courses") {
        return { select: userCoursesSelectMock };
      }

      if (table === "student_courses") {
        return { select: studentCoursesSelectMock };
      }

      if (table === "task_recurrence_configs") {
        return { insert: recurrenceInsertMock };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    userCoursesSelectMock.mockReturnValue({ eq: userCoursesEqMock });
    userCoursesEqMock.mockResolvedValue({
      data: [
        {
          course_id: "c-1",
          courses: {
            id: "c-1",
            short_name: "MAT",
            end_date: null,
          },
        },
        {
          course_id: "c-2",
          courses: {
            id: "c-2",
            short_name: "OLD",
            end_date: "2020-01-01T00:00:00.000Z",
          },
        },
      ],
      error: null,
    });

    studentCoursesSelectMock.mockReturnValue({ eq: studentCoursesEqMock });
    studentCoursesEqMock.mockImplementation((_column: string, courseId: string) => {
      if (courseId === "c-1") {
        return Promise.resolve({
          data: [
            {
              student_id: "s-1",
              students: { id: "s-1", full_name: "Ana Silva" },
            },
          ],
          error: null,
        });
      }

      return Promise.resolve({ data: [], error: null });
    });

    rpcMock.mockResolvedValue({ data: "2026-03-17T00:00:00.000Z", error: null });
    recurrenceInsertMock.mockResolvedValue({ error: null });
  });

  it("shows active courses and loads students after course selection", async () => {
    renderDialog();

    await pickComboboxOption(1, /MAT/i);

    await waitFor(() => {
      expect(studentCoursesEqMock).toHaveBeenCalledWith("course_id", "c-1");
    });

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("combobox")[2]);
    expect(await screen.findByRole("option", { name: /Ana Silva/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /OLD/i })).not.toBeInTheDocument();
  });

  it("creates recurrence config and closes dialog", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onSuccess } = renderDialog();

    await user.type(screen.getByPlaceholderText(/engajamento/i), "  Recorrencia semanal  ");
    await pickComboboxOption(1, /MAT/i);

    await user.click(screen.getByRole("button", { name: /Data de In/i }));
    await user.click(screen.getAllByTestId("mock-calendar")[0]);

    await user.click(screen.getByRole("button", { name: /Criar Recorr/i }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith("calculate_next_recurrence_date", {
        current_date: "2026-03-10T00:00:00.000Z",
        pattern: "semanal",
      });
    });

    expect(recurrenceInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Recorrencia semanal",
        course_id: "c-1",
        pattern: "semanal",
        start_date: "2026-03-10T00:00:00.000Z",
        task_type: "interna",
        priority: "media",
        created_by_user_id: "user-1",
        is_active: true,
        next_generation_at: "2026-03-17T00:00:00.000Z",
      }),
    );

    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringMatching(/sucesso/i));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("shows error toast when recurrence insert fails", async () => {
    const user = userEvent.setup();
    recurrenceInsertMock.mockResolvedValueOnce({ error: new Error("insert failed") });

    renderDialog();

    await user.type(screen.getByPlaceholderText(/engajamento/i), "Recorrencia com erro");
    await pickComboboxOption(1, /MAT/i);
    await user.click(screen.getByRole("button", { name: /Data de In/i }));
    await user.click(screen.getAllByTestId("mock-calendar")[0]);
    await user.click(screen.getByRole("button", { name: /Criar Recorr/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/erro/i));
    });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });
});
