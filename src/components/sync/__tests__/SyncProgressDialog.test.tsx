import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncProgressDialog, type SyncStep } from "@/components/sync/SyncProgressDialog";

function renderDialog(overrides: Partial<ComponentProps<typeof SyncProgressDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onClose = vi.fn();

  const props: ComponentProps<typeof SyncProgressDialog> = {
    open: true,
    onOpenChange,
    onClose,
    currentStep: "students",
    isComplete: false,
    steps: [
      {
        id: "courses",
        label: "Cursos",
        icon: "courses",
        status: "completed",
        count: 8,
      },
      {
        id: "students",
        label: "Alunos",
        icon: "students",
        status: "in_progress",
        count: 3,
        total: 10,
      },
    ],
    ...overrides,
  };

  render(<SyncProgressDialog {...props} />);
  return { onOpenChange, onClose };
}

describe("SyncProgressDialog", () => {
  it("renders in-progress sync details", () => {
    renderDialog();

    expect(screen.getByText(/Sincronizando dados/i)).toBeInTheDocument();
    expect(screen.getByText("3/10")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fechar/i })).not.toBeInTheDocument();
  });

  it("shows success summary and closes dialog on click", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({
      isComplete: true,
      summary: {
        courses: 4,
        students: 120,
        activities: 36,
        grades: 512,
      },
      steps: [
        { id: "courses", label: "Cursos", icon: "courses", status: "completed", count: 4 },
        { id: "students", label: "Alunos", icon: "students", status: "completed", count: 120 },
      ],
    });

    expect(screen.getByText(/conclu/i)).toBeInTheDocument();
    expect(screen.getByText(/Resumo da sincroniza/i)).toBeInTheDocument();
    expect(screen.getByText("512")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Fechar/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows error status and step error message", () => {
    renderDialog({
      isComplete: true,
      steps: [
        {
          id: "grades",
          label: "Notas",
          icon: "grades",
          status: "error",
          errorMessage: "Falha ao sincronizar notas",
        } as SyncStep,
      ],
    });

    expect(screen.getByText(/com erros/i)).toBeInTheDocument();
    expect(screen.getByText(/Falha ao sincronizar notas/i)).toBeInTheDocument();
  });
});
