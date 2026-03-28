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
    expect(
      screen.getByRole("tab", { name: /nova campanha/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /execucoes/i })).toBeInTheDocument();
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

    await user.click(screen.getByRole("tab", { name: /execucoes/i }));
    expect(screen.getByTestId("bulk-jobs-tab")).toBeInTheDocument();
  });

  it("treats legacy schedule links as the new campaign flow", () => {
    renderPage(["/campanhas?tab=agendamentos"]);

    expect(screen.getByTestId("bulk-send-tab")).toBeInTheDocument();
  });
});
