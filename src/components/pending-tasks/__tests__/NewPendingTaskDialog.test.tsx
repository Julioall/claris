import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewPendingTaskDialog } from "@/components/pending-tasks/NewPendingTaskDialog";

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const userCoursesSelectMock = vi.fn();
const userCoursesEqMock = vi.fn();
const studentCoursesSelectMock = vi.fn();
const studentCoursesEqMock = vi.fn();
const pendingTasksInsertMock = vi.fn();
const recurrenceInsertMock = vi.fn();
const recurrenceSelectMock = vi.fn();
const recurrenceSingleMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect?: (date: Date) => void }) => (
    <button type="button" onClick={() => onSelect?.(new Date("2026-03-20T00:00:00.000Z"))}>
      pick-date
    </button>
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function renderDialog(props: Partial<ComponentProps<typeof NewPendingTaskDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  render(
    <NewPendingTaskDialog
      open
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
      {...props}
    />,
  );

  return { onOpenChange, onSuccess };
}

async function selectOption(label: RegExp, optionName: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: optionName }));
}

describe("NewPendingTaskDialog", () => {
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

      if (table === "pending_tasks") {
        return { insert: pendingTasksInsertMock };
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
            category: "Escola A",
            end_date: null,
          },
        },
        {
          course_id: "c-2",
          courses: {
            id: "c-2",
            short_name: "OLD",
            category: "Escola B",
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

    pendingTasksInsertMock.mockResolvedValue({ error: null });
    recurrenceInsertMock.mockReturnValue({ select: recurrenceSelectMock });
    recurrenceSelectMock.mockReturnValue({ single: recurrenceSingleMock });
    recurrenceSingleMock.mockResolvedValue({ data: { id: "r-1" }, error: null });
  });

  it("shows only active courses and loads students after selecting a course", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("combobox", { name: /^Curso$/i }));
    expect(await screen.findByRole("option", { name: /MAT/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /OLD/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /MAT/i }));

    await waitFor(() => {
      expect(studentCoursesEqMock).toHaveBeenCalledWith("course_id", "c-1");
    });

    await user.click(screen.getByRole("combobox", { name: /^Aluno$/i }));
    expect(await screen.findByRole("option", { name: /Ana Silva/i })).toBeInTheDocument();
  });

  it("creates a manual task without recurrence", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onSuccess } = renderDialog();

    await user.type(
      screen.getByPlaceholderText(/follow-up com a turma/i),
      "  Nova pendencia importante  ",
    );
    await user.type(
      screen.getByPlaceholderText(/links importantes/i),
      "Ligar para a turma na sexta.",
    );
    await selectOption(/^Curso$/i, /MAT/i);
    await user.click(screen.getByRole("button", { name: /criar tarefa/i }));

    await waitFor(() => {
      expect(pendingTasksInsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Nova pendencia importante",
          description: "Ligar para a turma na sexta.",
          course_id: "c-1",
          task_type: "interna",
          status: "aberta",
          priority: "media",
          created_by_user_id: "user-1",
          automation_type: "manual",
          recurrence_id: null,
          is_recurring: false,
        }),
      );
    });

    expect(recurrenceInsertMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringMatching(/tarefa criada/i));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("creates a recurring routine linked to the first task", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(
      screen.getByPlaceholderText(/follow-up com a turma/i),
      "Revisar engajamento semanal",
    );
    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: /^Prazo$/i }));
    await user.click(await screen.findByRole("button", { name: /pick-date/i }));
    await user.click(screen.getByRole("button", { name: /criar tarefa/i }));

    await waitFor(() => {
      expect(recurrenceInsertMock).toHaveBeenCalled();
    });

    expect(pendingTasksInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Revisar engajamento semanal",
        automation_type: "recurring",
        recurrence_id: "r-1",
        is_recurring: true,
        due_date: "2026-03-20T00:00:00.000Z",
      }),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringMatching(/rotina criada/i));
  });

  it("shows an error toast when the user is not authenticated", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({ user: null });
    renderDialog();

    await user.type(
      screen.getByPlaceholderText(/follow-up com a turma/i),
      "Pendencia sem sessao",
    );
    await user.click(screen.getByRole("button", { name: /criar tarefa/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/estar logado/i));
    });

    expect(pendingTasksInsertMock).not.toHaveBeenCalled();
  });
});
