import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewActionDialog } from "@/components/actions/NewActionDialog";

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

const actionTypesOrderMock = vi.fn();
const userCoursesEqMock = vi.fn();
const studentCoursesEqMock = vi.fn();
const actionsInsertMock = vi.fn();
const actionsUpdateEqMock = vi.fn();
const actionsUpdateMock = vi.fn();

const actionTypesData = [{ name: "contato", label: "Contato" }];
const userCoursesData = [
  {
    course_id: "c-1",
    courses: { id: "c-1", short_name: "Curso A", end_date: null },
  },
];
const courseStudentsData = [
  { student_id: "s-1", students: { id: "s-1", full_name: "Ana Silva" } },
  { student_id: "s-2", students: { id: "s-2", full_name: "Bruno Lima" } },
];

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function renderDialog(props: Partial<ComponentProps<typeof NewActionDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  render(
    <NewActionDialog
      open
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
      {...props}
    />,
  );

  return { onOpenChange, onSuccess };
}

async function selectActionType(optionName: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getAllByRole("combobox")[0]);
  await user.click(await screen.findByRole("option", { name: optionName }));
}

async function selectCourse(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByPlaceholderText(/buscar curso/i));
  await user.click(await screen.findByText(name));
}

async function selectStudent(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByPlaceholderText(/buscar aluno/i));
  await user.click(await screen.findByText(name));
}

describe("NewActionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({
      user: { id: "user-1" },
      moodleSession: null,
    });

    actionTypesOrderMock.mockResolvedValue({ data: actionTypesData, error: null });
    userCoursesEqMock.mockResolvedValue({ data: userCoursesData, error: null });
    studentCoursesEqMock.mockImplementation((field: string) => {
      if (field === "course_id") {
        return Promise.resolve({ data: courseStudentsData, error: null });
      }

      return Promise.resolve({ data: [], error: null });
    });

    actionsInsertMock.mockResolvedValue({ error: null });
    actionsUpdateEqMock.mockResolvedValue({ error: null });
    actionsUpdateMock.mockReturnValue({ eq: actionsUpdateEqMock });

    fromMock.mockImplementation((table: string) => {
      if (table === "action_types") {
        return {
          select: () => ({
            eq: () => ({ order: actionTypesOrderMock }),
          }),
        };
      }

      if (table === "user_courses") {
        return {
          select: () => ({ eq: userCoursesEqMock }),
        };
      }

      if (table === "student_courses") {
        return {
          select: () => ({ eq: studentCoursesEqMock }),
        };
      }

      if (table === "actions") {
        return {
          insert: actionsInsertMock,
          update: actionsUpdateMock,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("creates one action when a specific student is selected", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onSuccess } = renderDialog();

    await selectActionType(/^Contato$/i);
    await selectCourse("Curso A");
    await selectStudent("Ana Silva");
    await user.type(screen.getByPlaceholderText(/descreva a ação/i), "Contato realizado por telefone");
    await user.click(screen.getByRole("button", { name: /criar ação/i }));

    await waitFor(() => {
      expect(actionsInsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: "contato",
          description: "Contato realizado por telefone",
          student_id: "s-1",
          course_id: "c-1",
          user_id: "user-1",
          status: "planejada",
        }),
      );
    });

    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringMatching(/criada com sucesso/i));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("creates actions for all students when no student is selected", async () => {
    const user = userEvent.setup();
    renderDialog();

    await selectActionType(/^Contato$/i);
    await selectCourse("Curso A");
    await user.type(screen.getByPlaceholderText(/descreva a ação/i), "Ação coletiva de acompanhamento");
    await user.click(screen.getByRole("button", { name: /criar ação/i }));

    await waitFor(() => {
      expect(actionsInsertMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ student_id: "s-1", course_id: "c-1", user_id: "user-1" }),
          expect.objectContaining({ student_id: "s-2", course_id: "c-1", user_id: "user-1" }),
        ]),
      );
    });

    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringMatching(/2 ações criadas com sucesso/i));
  });

  it("updates action in edit mode", async () => {
    const user = userEvent.setup();
    const actionToEdit = {
      id: "a-1",
      action_type: "contato" as const,
      description: "Descrição antiga",
      student_id: "s-1",
      course_id: "c-1",
      scheduled_date: null,
      student: { full_name: "Ana Silva" },
      course: { short_name: "Curso A" },
    };

    renderDialog({ actionToEdit });

    const description = screen.getByPlaceholderText(/descreva a ação/i);
    await user.clear(description);
    await user.type(description, "Descrição atualizada da ação");
    await user.click(screen.getByRole("button", { name: /atualizar ação/i }));

    await waitFor(() => {
      expect(actionsUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: "contato",
          description: "Descrição atualizada da ação",
          course_id: "c-1",
        }),
      );
    });

    expect(actionsUpdateEqMock).toHaveBeenCalledWith("id", "a-1");
    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringMatching(/atualizada com sucesso/i));
  });
});
