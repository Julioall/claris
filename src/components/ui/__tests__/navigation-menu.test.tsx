import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@radix-ui/react-navigation-menu", async () => {
  const ReactModule = await import("react");

  const withForwardRef = <T extends HTMLElement>(
    element: keyof JSX.IntrinsicElements,
    role?: string,
  ) =>
    ReactModule.forwardRef<T, React.HTMLAttributes<T>>(({ children, ...props }, ref) =>
      ReactModule.createElement(element, { ref, role, ...props }, children),
    );

  return {
    Root: withForwardRef<HTMLDivElement>("div", "navigation"),
    List: withForwardRef<HTMLUListElement>("ul"),
    Item: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
    Trigger: withForwardRef<HTMLButtonElement>("button"),
    Content: withForwardRef<HTMLDivElement>("div"),
    Link: withForwardRef<HTMLAnchorElement>("a"),
    Viewport: withForwardRef<HTMLDivElement>("div"),
    Indicator: withForwardRef<HTMLDivElement>("div"),
  };
});

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";

describe("ui/navigation-menu", () => {
  it("renderiza estrutura principal com viewport e indicador", () => {
    render(
      <NavigationMenu className="custom-root">
        <NavigationMenuList className="custom-list">
          <NavigationMenuItem>
            <NavigationMenuTrigger className="custom-trigger">Cursos</NavigationMenuTrigger>
            <NavigationMenuContent className="custom-content">
              <NavigationMenuLink href="#">Abrir cursos</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
        <NavigationMenuIndicator data-testid="indicator" className="custom-indicator" />
      </NavigationMenu>,
    );

    const nav = screen.getByRole("navigation");
    expect(nav.className).toContain("max-w-max");
    expect(nav.className).toContain("custom-root");

    expect(screen.getByRole("button", { name: /cursos/i }).className).toContain("custom-trigger");
    expect(screen.getByRole("link", { name: /abrir cursos/i })).toBeInTheDocument();
    expect(screen.getByTestId("indicator").className).toContain("custom-indicator");
  });

  it("exibe classes utilitárias do trigger e viewport", () => {
    render(
      <div>
        <div data-testid="trigger-style" className={navigationMenuTriggerStyle()} />
        <NavigationMenuViewport data-testid="viewport" className="custom-viewport" />
      </div>,
    );

    expect(screen.getByTestId("trigger-style").className).toContain("inline-flex");
    expect(screen.getByTestId("viewport").className).toContain("origin-top-center");
    expect(screen.getByTestId("viewport").className).toContain("custom-viewport");
  });
});
