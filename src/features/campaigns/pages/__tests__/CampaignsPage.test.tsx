import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import CampaignsPage from "@/features/campaigns/pages/CampaignsPage";

vi.mock("@/features/messages/components/BulkSendTab", () => ({
  BulkSendTab: () => <div data-testid="bulk-send-tab">Nova campanha</div>,
}));

vi.mock("@/features/automations/components/BulkJobsTab", () => ({
  BulkJobsTab: () => <div data-testid="bulk-jobs-tab">Execucoes</div>,
}));

vi.mock("@/features/automations/components/ScheduledMessagesTab", () => ({
  ScheduledMessagesTab: () => (
    <div data-testid="scheduled-messages-tab">Agendamentos</div>
  ),
}));

vi.mock("@/features/messages/components/MessageTemplatesTab", () => ({
  MessageTemplatesTab: () => (
    <div data-testid="message-templates-tab">Modelos</div>
  ),
}));

function renderPage(initialEntries?: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <CampaignsPage />
    </MemoryRouter>,
  );
}

describe("Campaigns page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the campaign hub with dedicated lifecycle tabs", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: /campanhas/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^campanhas$/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /modelos/i })).toBeInTheDocument();
    expect(screen.getByTestId("bulk-send-tab")).toBeInTheDocument();
  });

  it("supports deep-linking to campaign workflows", () => {
    renderPage(["/campanhas?tab=modelos"]);

    expect(screen.getByTestId("message-templates-tab")).toBeInTheDocument();
  });

  it("switches between campaign tabs", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("tab", { name: /modelos/i }));
    expect(screen.getByTestId("message-templates-tab")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /^campanhas$/i }));
    expect(screen.getByTestId("bulk-jobs-tab")).toBeInTheDocument();
  });

  it("maps legacy nova-campanha links to campanhas", () => {
    renderPage(["/campanhas?tab=nova-campanha"]);

    expect(screen.getByTestId("bulk-send-tab")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-jobs-tab")).toBeInTheDocument();
  });

  it("maps schedule deep link to campanhas", () => {
    renderPage(["/campanhas?tab=agendamentos"]);

    expect(screen.getByTestId("bulk-jobs-tab")).toBeInTheDocument();
    expect(screen.getByTestId("scheduled-messages-tab")).toBeInTheDocument();
  });

  it("maps legacy execution links to campanhas", () => {
    renderPage(["/campanhas?tab=execucoes"]);

    expect(screen.getByTestId("bulk-jobs-tab")).toBeInTheDocument();
  });
});
