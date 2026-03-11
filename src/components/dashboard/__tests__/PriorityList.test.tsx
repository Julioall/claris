import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PriorityList } from "@/components/dashboard/PriorityList";
import type { PendingTask, Student } from "@/types";

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

function renderWithRouter(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const baseTimestamp = "2026-02-20T12:00:00.000Z";

function buildTask(
  id: string,
  title: string,
  studentId: string,
  studentName: string,
  priority: PendingTask["priority"] = "media",
): PendingTask {
  return {
    id,
    title,
    student_id: studentId,
    task_type: "interna",
    status: "aberta",
    priority,
    due_date: new Date().toISOString(),
    created_at: baseTimestamp,
    updated_at: baseTimestamp,
    student: {
      id: studentId,
      moodle_user_id: studentId,
      full_name: studentName,
      current_risk_level: "risco",
      created_at: baseTimestamp,
      updated_at: baseTimestamp,
    },
  };
}

function buildCriticalStudent(id: string, name: string, pendingTasksCount: number): Student {
  return {
    id,
    moodle_user_id: id,
    full_name: name,
    current_risk_level: "critico",
    pending_tasks_count: pendingTasksCount,
    created_at: baseTimestamp,
    updated_at: baseTimestamp,
  };
}

describe("PriorityList", () => {
  it("renders overdue, upcoming and critical sections with a max of three items each", () => {
    const overdue = [1, 2, 3, 4].map((n) =>
      buildTask(`ov-${n}`, `Atrasada ${n}`, `s-${n}`, `Aluno ${n}`, "alta"),
    );

    const upcoming = [1, 2, 3, 4].map((n) =>
      buildTask(`up-${n}`, `Proxima ${n}`, `u-${n}`, `Estudante ${n}`),
    );

    const critical = [1, 2, 3, 4].map((n) =>
      buildCriticalStudent(`cr-${n}`, `Critico ${n}`, n),
    );

    renderWithRouter(
      <PriorityList
        overdueTasks={overdue}
        upcomingTasks={upcoming}
        criticalStudents={critical}
      />,
    );

    expect(screen.getByText(/atrasados/i)).toBeInTheDocument();
    expect(screen.getByText(/prazo proximo/i)).toBeInTheDocument();
    expect(screen.getByText("Atrasada 1")).toBeInTheDocument();
    expect(screen.getByText("Proxima 1")).toBeInTheDocument();
    expect(screen.getByText("Critico 1")).toBeInTheDocument();
    expect(screen.getAllByText("Hoje").length).toBeGreaterThan(0);

    expect(screen.queryByText("Atrasada 4")).not.toBeInTheDocument();
    expect(screen.queryByText("Proxima 4")).not.toBeInTheDocument();
    expect(screen.queryByText("Critico 4")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /acao/i })).not.toBeInTheDocument();
  });

  it("renders empty state when there are no priorities", () => {
    renderWithRouter(
      <PriorityList overdueTasks={[]} upcomingTasks={[]} criticalStudents={[]} />,
    );

    expect(screen.getByText(/nenhuma prioridade pendente/i)).toBeInTheDocument();
  });
});
