import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityFeed } from "@/features/dashboard/components/ActivityFeed";

describe("ActivityFeed", () => {
  it("renders activity items including unknown event types", () => {
    render(
      <ActivityFeed
        items={[
          {
            id: "evt-1",
            eventType: "task_created",
            title: "Nova pendencia criada",
            description: "Pendencia para aluno Ana",
            occurredAt: "2026-02-20T12:00:00.000Z",
          },
          {
            id: "evt-2",
            eventType: "evento_desconhecido",
            title: "Evento customizado",
            description: undefined,
            occurredAt: "2026-02-20T13:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText(/atividade recente/i)).toBeInTheDocument();
    expect(screen.getByText("Nova pendencia criada")).toBeInTheDocument();
    expect(screen.getByText("Pendencia para aluno Ana")).toBeInTheDocument();
    expect(screen.getByText("Evento customizado")).toBeInTheDocument();
  });

  it("renders empty state when there are no activities", () => {
    render(<ActivityFeed items={[]} />);

    expect(screen.getByText(/nenhuma atividade recente/i)).toBeInTheDocument();
  });
});
