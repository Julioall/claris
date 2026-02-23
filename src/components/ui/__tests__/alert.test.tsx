import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

describe("ui/alert", () => {
  it("renders default alert with title and description", () => {
    render(
      <Alert>
        <AlertTitle>Título</AlertTitle>
        <AlertDescription>
          <p>Mensagem padrão</p>
        </AlertDescription>
      </Alert>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Título")).toBeInTheDocument();
    expect(screen.getByText("Mensagem padrão")).toBeInTheDocument();
  });

  it("applies destructive variant classes", () => {
    render(<Alert variant="destructive">Erro crítico</Alert>);

    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("text-destructive");
    expect(screen.getByText("Erro crítico")).toBeInTheDocument();
  });
});
