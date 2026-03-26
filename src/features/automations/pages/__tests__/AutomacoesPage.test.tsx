import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AutomacoesPage from "@/features/automations/pages/AutomacoesPage";

vi.mock("@/features/automations/components/BulkJobsTab", () => ({
  BulkJobsTab: () => <div data-testid="bulk-jobs-tab">Bulk jobs</div>,
}));

vi.mock("@/features/automations/components/ScheduledMessagesTab", () => ({
  ScheduledMessagesTab: () => <div data-testid="scheduled-messages-tab">Agendamentos</div>,
}));

vi.mock("@/features/automations/components/RotinasTab", () => ({
  RotinasTab: () => <div data-testid="rotinas-tab">Rotinas</div>,
}));

vi.mock("@/features/messages/components/BulkSendTab", () => ({
  BulkSendTab: () => <div data-testid="bulk-send-tab">Envio em massa</div>,
}));

vi.mock("@/features/messages/components/MessageTemplatesTab", () => ({
  MessageTemplatesTab: () => <div data-testid="message-templates-tab">Modelos</div>,
}));

function renderPage(initialEntries?: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AutomacoesPage />
    </MemoryRouter>,
  );
}

describe("Automacoes page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the automation hub with bulk send, templates and operational tabs", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: /automa/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /envio em massa/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /jobs de envio/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /modelos/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /agendamentos/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /rotinas/i })).toBeInTheDocument();
    expect(screen.getByTestId("bulk-jobs-tab")).toBeInTheDocument();
  });

  it("supports deep-linking to moved messaging workflows", () => {
    renderPage(["/automacoes?tab=modelos"]);

    expect(screen.getByTestId("message-templates-tab")).toBeInTheDocument();
  });

  it("switches between automation tabs", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("tab", { name: /envio em massa/i }));
    expect(screen.getByTestId("bulk-send-tab")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /agendamentos/i }));
    expect(screen.getByTestId("scheduled-messages-tab")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /rotinas/i }));
    expect(screen.getByTestId("rotinas-tab")).toBeInTheDocument();
  });
});
