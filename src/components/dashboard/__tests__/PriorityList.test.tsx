import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PriorityList } from "@/components/dashboard/PriorityList";

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

function renderWithRouter(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("PriorityList", () => {
  it("renders overdue, upcoming and critical sections with a max of three items each", () => {
    const today = new Date().toISOString();

    const overdue = [1, 2, 3, 4].map((n) => ({
      id: `ov-${n}`,
      title: `Atrasada ${n}`,
      student_id: `s-${n}`,
      student: { full_name: `Aluno ${n}` },
      due_date: today,
      updated_at: "2026-02-20T12:00:00.000Z",
    }));

    const upcoming = [1, 2, 3, 4].map((n) => ({
      id: `up-${n}`,
      title: `Proxima ${n}`,
      student_id: `u-${n}`,
      student: { full_name: `Estudante ${n}` },
      priority: "media",
      due_date: today,
      updated_at: "2026-02-20T12:00:00.000Z",
    }));

    const critical = [1, 2, 3, 4].map((n) => ({
      id: `cr-${n}`,
      full_name: `Critico ${n}`,
      current_risk_level: "critico",
      pending_tasks_count: n,
      updated_at: "2026-02-20T12:00:00.000Z",
    }));

    renderWithRouter(
      <PriorityList
        overdueActions={overdue as any}
        upcomingTasks={upcoming as any}
        criticalStudents={critical as any}
      />,
    );

    expect(screen.getByText(/atrasados/i)).toBeInTheDocument();
    expect(screen.getByText(/prazo pr/i)).toBeInTheDocument();
    expect(screen.getByText("Atrasada 1")).toBeInTheDocument();
    expect(screen.getByText("Proxima 1")).toBeInTheDocument();
    expect(screen.getByText("Critico 1")).toBeInTheDocument();
    expect(screen.getAllByText("Hoje").length).toBeGreaterThan(0);

    expect(screen.queryByText("Atrasada 4")).not.toBeInTheDocument();
    expect(screen.queryByText("Proxima 4")).not.toBeInTheDocument();
    expect(screen.queryByText("Critico 4")).not.toBeInTheDocument();
  });

  it("renders empty state when there are no priorities", () => {
    renderWithRouter(
      <PriorityList overdueActions={[]} upcomingTasks={[]} criticalStudents={[]} />,
    );

    expect(screen.getByText(/nenhuma prioridade pendente/i)).toBeInTheDocument();
  });
});
