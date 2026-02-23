import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/toaster";

const useToastMock = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => useToastMock(),
}));

describe("ui/toaster", () => {
  it("renders title and description from active toasts", () => {
    useToastMock.mockReturnValue({
      toasts: [
        {
          id: "1",
          open: true,
          title: "Sincronização",
          description: "Concluída com sucesso",
        },
      ],
    });

    render(<Toaster />);

    expect(screen.getByText("Sincronização")).toBeInTheDocument();
    expect(screen.getByText("Concluída com sucesso")).toBeInTheDocument();
  });

  it("renders custom action element inside toast", () => {
    useToastMock.mockReturnValue({
      toasts: [
        {
          id: "2",
          open: true,
          title: "Erro",
          action: <button type="button">Tentar novamente</button>,
        },
      ],
    });

    render(<Toaster />);

    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeInTheDocument();
  });
});
