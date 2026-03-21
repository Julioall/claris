import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PriorityList } from "@/features/dashboard/components/PriorityList";
import type { Student } from "@/features/students/types";

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

function renderWithRouter(ui: ReactNode) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </MemoryRouter>,
  );
}

const baseTimestamp = "2026-02-20T12:00:00.000Z";

function buildCriticalStudent(id: string, name: string): Student {
  return {
    id,
    moodle_user_id: id,
    full_name: name,
    current_risk_level: "critico",
    created_at: baseTimestamp,
    updated_at: baseTimestamp,
  };
}

describe("PriorityList", () => {
  it("renders critical students with a max of three items", () => {
    const critical = [1, 2, 3, 4].map((n) =>
      buildCriticalStudent(`cr-${n}`, `Critico ${n}`),
    );

    renderWithRouter(
      <PriorityList criticalStudents={critical} />,
    );

    expect(screen.getByText("Critico 1")).toBeInTheDocument();
    expect(screen.getByText("Critico 2")).toBeInTheDocument();
    expect(screen.getByText("Critico 3")).toBeInTheDocument();
    expect(screen.queryByText("Critico 4")).not.toBeInTheDocument();
  });

  it("renders empty state when there are no priorities", () => {
    renderWithRouter(
      <PriorityList criticalStudents={[]} />,
    );

    expect(screen.getByText(/nenhuma prioridade pendente/i)).toBeInTheDocument();
  });
});
