import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import CampaignsPage from "@/features/campaigns/pages/CampaignsPage";

vi.mock("@/features/messages/components/BulkSendTab", () => ({
  BulkSendTab: ({ compactTrigger }: { compactTrigger?: boolean }) => (
    <div data-testid="bulk-send-tab">{compactTrigger ? "Nova campanha compacta" : "Nova campanha"}</div>
  ),
}));

vi.mock("@/features/campaigns/components/BulkJobsTab", () => ({
  BulkJobsTab: ({ mode, title }: { mode?: "full" | "stats" | "list"; title?: string }) => (
    <div data-testid={mode === "stats" ? "bulk-jobs-stats" : "bulk-jobs-list"}>
      {title || "Execucoes"}
    </div>
  ),
}));

vi.mock("@/features/campaigns/components/ScheduledMessagesTab", () => ({
  ScheduledMessagesTab: ({ allowCreate }: { allowCreate?: boolean }) => (
    <div data-testid="scheduled-messages-tab">
      Agendamentos
      {allowCreate ? <span data-testid="scheduled-allow-create">com-criacao</span> : null}
    </div>
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
    expect(screen.getByTestId("bulk-jobs-stats")).toBeInTheDocument();
    expect(screen.queryByTestId("scheduled-allow-create")).not.toBeInTheDocument();
    expect(screen.getByTestId("bulk-jobs-list")).toBeInTheDocument();
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
    expect(screen.getByTestId("bulk-jobs-stats")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-jobs-list")).toBeInTheDocument();
  });

  it("maps legacy nova-campanha links to campanhas", () => {
    renderPage(["/campanhas?tab=nova-campanha"]);

    expect(screen.getByTestId("bulk-send-tab")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-jobs-tab")).toBeInTheDocument();
  });

  it("maps schedule deep link to campanhas", () => {
    renderPage(["/campanhas?tab=agendamentos"]);

    expect(screen.getByTestId("bulk-jobs-stats")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-jobs-list")).toBeInTheDocument();
    expect(screen.getByTestId("scheduled-messages-tab")).toBeInTheDocument();
  });

  it("maps legacy execution links to campanhas", () => {
    renderPage(["/campanhas?tab=execucoes"]);

    expect(screen.getByTestId("bulk-jobs-list")).toBeInTheDocument();
  });

  it("maps legacy nova-campanha link to campanhas", () => {
    renderPage(["/campanhas?tab=nova-campanha"]);

    expect(screen.getByRole("tab", { name: /^campanhas$/i })).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("bulk-jobs-list")).toBeInTheDocument();
  });
});
