import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionTypesCard } from "@/components/settings/ActionTypesCard";

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

const actionTypesFetchOrderMock = vi.fn();
const actionTypesInsertDefaultsSelectMock = vi.fn();
const actionTypesInsertSingleMock = vi.fn();
const actionTypesUpdateEqMock = vi.fn();
const actionTypesDeleteEqMock = vi.fn();
const actionsUsageEqMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

describe("ActionTypesCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({
      user: { id: "user-1" },
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "action_types") {
        return {
          select: (columns?: string) => {
            if (columns === "*") {
              return {
                eq: (_column: string, _value: string) => ({
                  order: actionTypesFetchOrderMock,
                }),
              };
            }

            return { single: actionTypesInsertSingleMock };
          },
          insert: (payload: unknown) => {
            if (Array.isArray(payload)) {
              return { select: actionTypesInsertDefaultsSelectMock };
            }

            return { select: () => ({ single: actionTypesInsertSingleMock }) };
          },
          update: (payload: { label: string }) => ({
            eq: (column: string, id: string) =>
              actionTypesUpdateEqMock(payload, column, id),
          }),
          delete: () => ({
            eq: (column: string, id: string) => actionTypesDeleteEqMock(column, id),
          }),
        };
      }

      if (table === "actions") {
        return {
          select: () => ({
            eq: (column: string, _value: string) => {
              if (column !== "user_id") {
                throw new Error(`Unexpected first actions.eq column: ${column}`);
              }
              return {
                eq: (column2: string, value2: string) =>
                  actionsUsageEqMock(column2, value2),
              };
            },
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    actionTypesFetchOrderMock.mockResolvedValue({
      data: [
        { id: "default-1", name: "contato", label: "Contato" },
        { id: "custom-1", name: "mentoria", label: "Mentoria" },
      ],
      error: null,
    });

    actionTypesInsertDefaultsSelectMock.mockResolvedValue({ data: [], error: null });
    actionTypesInsertSingleMock.mockResolvedValue({
      data: { id: "custom-2", name: "mentoria_plus", label: "Mentoria Plus" },
      error: null,
    });

    actionTypesUpdateEqMock.mockResolvedValue({ error: null });
    actionTypesDeleteEqMock.mockResolvedValue({ error: null });
    actionsUsageEqMock.mockResolvedValue({ count: 0, error: null });
  });

  it("loads and renders existing action types", async () => {
    render(<ActionTypesCard />);

    expect(await screen.findByText("Contato")).toBeInTheDocument();
    expect(screen.getByText("Mentoria")).toBeInTheDocument();
  });

  it("adds a new action type and shows success toast", async () => {
    const user = userEvent.setup();
    render(<ActionTypesCard />);

    await screen.findByText("Mentoria");
    await user.type(
      screen.getByPlaceholderText(/Nome do novo tipo/i),
      "Mentoria Plus",
    );
    await user.click(screen.getByRole("button", { name: /Adicionar/i }));

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        expect.stringMatching(/adicionado/i),
      );
    });

    expect(screen.getByText("Mentoria Plus")).toBeInTheDocument();
  });

  it("blocks duplicate action type names", async () => {
    const user = userEvent.setup();
    render(<ActionTypesCard />);

    await screen.findByText("Mentoria");
    await user.type(screen.getByPlaceholderText(/Nome do novo tipo/i), "Mentoria");
    await user.click(screen.getByRole("button", { name: /Adicionar/i }));

    expect(toastErrorMock).toHaveBeenCalledWith(
      expect.stringMatching(/existe um tipo/i),
    );
    expect(actionTypesInsertSingleMock).not.toHaveBeenCalled();
  });

  it("edits and saves a custom action type label", async () => {
    const user = userEvent.setup();
    render(<ActionTypesCard />);

    const badgeLabel = await screen.findByText("Mentoria");
    const badge =
      badgeLabel.closest("[class*='group']") ?? badgeLabel.parentElement;
    if (!badge) throw new Error("Could not find badge for Mentoria");

    await user.click(within(badge as HTMLElement).getAllByRole("button")[0]);

    const editInput = screen.getByDisplayValue("Mentoria");
    await user.clear(editInput);
    await user.type(editInput, "Mentoria VIP{Enter}");

    await waitFor(() => {
      expect(actionTypesUpdateEqMock).toHaveBeenCalledWith(
        { label: "Mentoria VIP" },
        "id",
        "custom-1",
      );
    });

    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringMatching(/atualizado/i),
    );
    expect(screen.getByText("Mentoria VIP")).toBeInTheDocument();
  });

  it("deletes an unused custom type directly", async () => {
    const user = userEvent.setup();
    render(<ActionTypesCard />);

    const badgeLabel = await screen.findByText("Mentoria");
    const badge =
      badgeLabel.closest("[class*='group']") ?? badgeLabel.parentElement;
    if (!badge) throw new Error("Could not find badge for Mentoria");

    await user.click(within(badge as HTMLElement).getAllByRole("button")[1]);

    await waitFor(() => {
      expect(actionsUsageEqMock).toHaveBeenCalledWith("action_type", "mentoria");
      expect(actionTypesDeleteEqMock).toHaveBeenCalledWith("id", "custom-1");
    });

    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringMatching(/removido/i),
    );
    expect(screen.queryByText("Mentoria")).not.toBeInTheDocument();
  });
});
