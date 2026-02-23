import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("vaul", async () => {
  const ReactModule = await import("react");

  const withForwardRef = <T extends HTMLElement>(
    element: keyof JSX.IntrinsicElements,
    role?: string,
  ) =>
    ReactModule.forwardRef<T, React.HTMLAttributes<T>>(({ children, ...props }, ref) =>
      ReactModule.createElement(element, { ref, role, ...props }, children),
    );

  return {
    Drawer: {
      Root: ({ children, shouldScaleBackground, ...props }: React.HTMLAttributes<HTMLDivElement> & { shouldScaleBackground?: boolean }) => (
        <div data-testid="drawer-root" data-scale={String(shouldScaleBackground)} {...props}>
          {children}
        </div>
      ),
      Trigger: withForwardRef<HTMLButtonElement>("button"),
      Portal: ({ children }: { children?: React.ReactNode }) => <div data-testid="drawer-portal">{children}</div>,
      Close: withForwardRef<HTMLButtonElement>("button"),
      Overlay: withForwardRef<HTMLDivElement>("div"),
      Content: withForwardRef<HTMLDivElement>("div"),
      Title: withForwardRef<HTMLHeadingElement>("h2"),
      Description: withForwardRef<HTMLParagraphElement>("p"),
    },
  };
});

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

describe("ui/drawer", () => {
  it("renderiza estrutura do drawer e classes de layout", () => {
    render(
      <Drawer>
        <DrawerTrigger>Abrir</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader data-testid="header">Header</DrawerHeader>
          <DrawerFooter data-testid="footer">Footer</DrawerFooter>
        </DrawerContent>
      </Drawer>,
    );

    expect(screen.getByTestId("drawer-root")).toHaveAttribute("data-scale", "true");
    expect(screen.getByTestId("drawer-portal")).toBeInTheDocument();
    expect(screen.getByTestId("header").className).toContain("grid");
    expect(screen.getByTestId("footer").className).toContain("mt-auto");
  });

  it("aplica shouldScaleBackground customizado e renderiza title/description", () => {
    render(
      <Drawer shouldScaleBackground={false}>
        <DrawerContent>
          <DrawerTitle>Título</DrawerTitle>
          <DrawerDescription>Descrição</DrawerDescription>
          <DrawerClose>Fechar</DrawerClose>
        </DrawerContent>
      </Drawer>,
    );

    expect(screen.getByTestId("drawer-root")).toHaveAttribute("data-scale", "false");
    expect(screen.getByText("Título").className).toContain("font-semibold");
    expect(screen.getByText("Descrição").className).toContain("text-muted-foreground");
    expect(screen.getByRole("button", { name: /fechar/i })).toBeInTheDocument();
  });
});
