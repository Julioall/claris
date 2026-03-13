import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CourseOverview } from "@/components/dashboard/CourseOverview";

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

function renderWithRouter(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("CourseOverview", () => {
  it("renders course metrics and details", () => {
    renderWithRouter(
      <CourseOverview
        courses={[
          {
            id: "c-1",
            name: "Matematica Aplicada",
            students_count: 25,
            at_risk_count: 3,
            pending_tasks_count: 4,
            last_sync: "2026-02-20T12:00:00.000Z",
          } as unknown,
        ]}
      />,
    );

    expect(screen.getByText("Matematica Aplicada")).toBeInTheDocument();
    expect(screen.getByText(/25 alunos/i)).toBeInTheDocument();
    expect(screen.getByText(/3 em risco/i)).toBeInTheDocument();
    expect(screen.getByText(/4 pend/i)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/cursos/c-1");
    expect(screen.getByText(/sincronizado/i)).toBeInTheDocument();
  });

  it("renders empty state when there are no courses", () => {
    renderWithRouter(<CourseOverview courses={[]} />);

    expect(screen.getByText(/nenhum curso encontrado/i)).toBeInTheDocument();
  });

  it("shows never synced label when last sync is missing", () => {
    renderWithRouter(
      <CourseOverview
        courses={[
          {
            id: "c-2",
            name: "Fisica",
            students_count: 0,
            at_risk_count: 0,
            pending_tasks_count: 0,
            last_sync: undefined,
          } as unknown,
        ]}
      />,
    );

    expect(screen.getByText(/nunca/i)).toBeInTheDocument();
    expect(screen.queryByText(/em risco/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pend/i)).not.toBeInTheDocument();
  });
});
