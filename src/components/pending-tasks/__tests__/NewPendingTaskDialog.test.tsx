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
const taskTemplatesSelectMock = vi.fn();
const taskTemplatesEqUserMock = vi.fn();
const taskTemplatesEqActiveMock = vi.fn();
const taskTemplatesOrderMock = vi.fn();
const pendingTasksInsertMock = vi.fn();
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

async function pickComboboxOption(label: RegExp, optionName: RegExp) {
  const user = userEvent.setup();
  const combobox = screen.getByRole("combobox", { name: label });
  await user.click(combobox);
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

      if (table === "task_templates") {
        return { select: taskTemplatesSelectMock };
      }

      if (table === "pending_tasks") {
        return { insert: pendingTasksInsertMock };
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

    taskTemplatesSelectMock.mockReturnValue({ eq: taskTemplatesEqUserMock });
    taskTemplatesEqUserMock.mockReturnValue({ eq: taskTemplatesEqActiveMock });
    taskTemplatesEqActiveMock.mockReturnValue({ order: taskTemplatesOrderMock });
    taskTemplatesOrderMock.mockResolvedValue({ data: [], error: null });

    pendingTasksInsertMock.mockResolvedValue({ error: null });
  });

  it("shows only active courses and loads students after selecting a course", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: /Escopo e detalhes/i }));
    await user.click(screen.getByRole("combobox", { name: /Curso \/ Turma/i }));
    expect(await screen.findByRole("option", { name: /MAT/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /OLD/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /MAT/i }));

    await waitFor(() => {
      expect(studentCoursesEqMock).toHaveBeenCalledWith("course_id", "c-1");
    });

    await user.click(screen.getByRole("combobox", { name: /^Aluno$/i }));
    expect(await screen.findByRole("option", { name: /Ana Silva/i })).toBeInTheDocument();
  });

  it("creates a non-recurring pending task", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onSuccess } = renderDialog();

    await user.type(
      screen.getByPlaceholderText(/boas-vindas aos alunos/i),
      "  Nova pendencia importante  ",
    );
    await user.click(screen.getByRole("button", { name: /Escopo e detalhes/i }));
    await pickComboboxOption(/Curso \/ Turma/i, /MAT/i);
    await user.click(screen.getByRole("button", { name: /Criar Pend/i }));

    await waitFor(() => {
      expect(pendingTasksInsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Nova pendencia importante",
          course_id: "c-1",
          task_type: "interna",
          priority: "media",
          created_by_user_id: "user-1",
          status: "aberta",
        }),
      );
    });

    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringMatching(/pend.ncia criada com sucesso/i));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("shows an error toast when the user is not authenticated", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({ user: null });
    renderDialog();

    await user.type(
      screen.getByPlaceholderText(/boas-vindas aos alunos/i),
      "Pendencia sem sessao",
    );
    await user.click(screen.getByRole("button", { name: /Criar Pend/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/precisa estar logado/i));
    });

    expect(pendingTasksInsertMock).not.toHaveBeenCalled();
  });
});
