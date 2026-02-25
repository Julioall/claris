import type { ComponentProps } from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GenerateAutomatedTasksDialog } from "../GenerateAutomatedTasksDialog";

const invokeMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastInfoMock = vi.fn();
const toastErrorMock = vi.fn();
const useAuthMock = vi.fn();
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    info: (...args: unknown[]) => toastInfoMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

function renderDialog(
  props: Partial<ComponentProps<typeof GenerateAutomatedTasksDialog>> = {},
) {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  render(
    <GenerateAutomatedTasksDialog
      open
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
      {...props}
    />,
  );

  return { onOpenChange, onSuccess };
}

async function toggleCardByCheckboxIndex(index: number) {
  const user = userEvent.setup();
  const checkbox = screen.getAllByRole("checkbox")[index];
  const card = checkbox.closest('div[class*="cursor-pointer"]');
  if (!card) throw new Error("Could not find automation type card");
  await user.click(card);
}

describe("GenerateAutomatedTasksDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      user: { id: "user-1" },
    });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders with three default selected automation types", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: /gerar/i })).toHaveTextContent(
      "(3 tipos)",
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("calls onOpenChange(false) when clicking cancel", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables generate button when all selected types are removed", async () => {
    renderDialog();

    await toggleCardByCheckboxIndex(0);
    await toggleCardByCheckboxIndex(1);
    await toggleCardByCheckboxIndex(2);

    expect(screen.getByRole("button", { name: /gerar/i })).toBeDisabled();
  });

  it("does not invoke generation when user is not authenticated", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({ user: null });
    renderDialog();

    await user.click(screen.getByRole("button", { name: /gerar/i }));

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("shows success toast and closes dialog when tasks are created", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onSuccess } = renderDialog();

    invokeMock.mockResolvedValue({
      data: {
        results: [
          { type: "auto_at_risk", tasks_created: 2 },
          { type: "auto_no_access", tasks_created: 0 },
        ],
      },
      error: null,
    });

    await user.click(screen.getByRole("button", { name: /gerar/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("generate-automated-tasks", {
        body: {
          automation_types: [
            "auto_at_risk",
            "auto_missed_assignment",
            "auto_uncorrected_activity",
          ],
        },
      });
    });

    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock.mock.calls[0][0]).toContain("2");
    expect(toastSuccessMock.mock.calls[0][1]).toMatchObject({
      description: expect.stringContaining("Alunos em Risco: 2"),
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows info toast when no new tasks are created", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onSuccess } = renderDialog();

    invokeMock.mockResolvedValue({
      data: {
        results: [
          { type: "auto_at_risk", tasks_created: 0 },
          { type: "auto_missed_assignment", tasks_created: 0 },
        ],
      },
      error: null,
    });

    await user.click(screen.getByRole("button", { name: /gerar/i }));

    await waitFor(() => {
      expect(toastInfoMock).toHaveBeenCalledTimes(1);
    });

    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows error toast when generation fails", async () => {
    const user = userEvent.setup();
    renderDialog();

    invokeMock.mockResolvedValue({
      data: null,
      error: new Error("request failed"),
    });

    await user.click(screen.getByRole("button", { name: /gerar/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledTimes(1);
    });

    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastInfoMock).not.toHaveBeenCalled();
  });
});
