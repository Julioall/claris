import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddTaskActionDialog } from "@/components/pending-tasks/AddTaskActionDialog";

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const taskActionsInsertMock = vi.fn();
const pendingTasksUpdateMock = vi.fn();
const pendingTasksUpdateEqMock = vi.fn();
const pendingTasksUpdateInMock = vi.fn();
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

function renderDialog(props: Partial<ComponentProps<typeof AddTaskActionDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  render(
    <AddTaskActionDialog
      open
      pendingTaskId="task-1"
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
      {...props}
    />,
  );

  return { onOpenChange, onSuccess };
}

async function pickSelectOption(index: number, optionName: RegExp) {
  const user = userEvent.setup();
  const selectTrigger = screen.getAllByRole("combobox")[index];
  await user.click(selectTrigger);
  await user.click(await screen.findByRole("option", { name: optionName }));
}

describe("AddTaskActionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: "user-1" } });

    fromMock.mockImplementation((table: string) => {
      if (table === "task_actions") {
        return { insert: taskActionsInsertMock };
      }

      if (table === "pending_tasks") {
        return { update: pendingTasksUpdateMock };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    taskActionsInsertMock.mockResolvedValue({ error: null });
    pendingTasksUpdateMock.mockReturnValue({ eq: pendingTasksUpdateEqMock });
    pendingTasksUpdateEqMock.mockImplementation(() => ({
      error: null,
      in: pendingTasksUpdateInMock,
    }));
    pendingTasksUpdateInMock.mockResolvedValue({ error: null });
  });

  it("blocks submit and shows error when user is not authenticated", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({ user: null });
    const { onOpenChange } = renderDialog();

    await user.type(screen.getByPlaceholderText(/descreva/i), "Descricao longa suficiente");
    await user.click(screen.getByRole("button", { name: /adicionar/i }));

    expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/logado/i));
    expect(taskActionsInsertMock).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("adds action with default effectiveness and closes dialog", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onSuccess } = renderDialog();

    await user.type(screen.getByPlaceholderText(/descreva/i), "Descricao longa suficiente");
    await user.click(screen.getByRole("button", { name: /adicionar/i }));

    await waitFor(() => {
      expect(taskActionsInsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          pending_task_id: "task-1",
          action_type: "contato",
          effectiveness: "pendente",
          executed_by_user_id: "user-1",
        }),
      );
    });

    expect(pendingTasksUpdateMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringMatching(/adicionada com sucesso/i));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("auto-resolves pending task when effectiveness is eficaz", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await pickSelectOption(1, /^Eficaz$/i);
    await user.type(screen.getByPlaceholderText(/descreva/i), "Descricao longa suficiente");
    await user.click(screen.getByRole("button", { name: /adicionar/i }));

    await waitFor(() => {
      expect(pendingTasksUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "resolvida",
          completed_at: expect.any(String),
        }),
      );
    });

    expect(pendingTasksUpdateEqMock).toHaveBeenCalledWith("id", "task-1");
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringMatching(/resolvida automaticamente/i),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("moves task to em_andamento when effectiveness is parcialmente eficaz", async () => {
    const user = userEvent.setup();
    renderDialog();

    await pickSelectOption(1, /Parcialmente Eficaz/i);
    await user.type(screen.getByPlaceholderText(/descreva/i), "Descricao longa suficiente");
    await user.click(screen.getByRole("button", { name: /adicionar/i }));

    await waitFor(() => {
      expect(pendingTasksUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "em_andamento" }),
      );
    });

    expect(pendingTasksUpdateInMock).toHaveBeenCalledWith("status", ["aberta"]);
    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringMatching(/em andamento/i));
  });
});
