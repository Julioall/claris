import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@radix-ui/react-dropdown-menu", async () => {
  const ReactModule = await import("react");

  const withForwardRef = <T extends HTMLElement>(
    element: keyof JSX.IntrinsicElements,
    role?: string,
  ) =>
    ReactModule.forwardRef<T, React.HTMLAttributes<T> & { checked?: boolean }>(({ children, ...props }, ref) =>
      ReactModule.createElement(element, { ref, role, ...props }, children),
    );

  const BaseItem = withForwardRef<HTMLDivElement>("div", "menuitem");

  return {
    Root: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Trigger: withForwardRef<HTMLButtonElement>("button"),
    Group: ({ children }: { children?: React.ReactNode }) => <div role="group">{children}</div>,
    Portal: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Sub: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    RadioGroup: ({ children }: { children?: React.ReactNode }) => <div role="group">{children}</div>,
    SubTrigger: withForwardRef<HTMLDivElement>("div", "menuitem"),
    SubContent: withForwardRef<HTMLDivElement>("div"),
    Content: ReactModule.forwardRef<
      HTMLDivElement,
      React.HTMLAttributes<HTMLDivElement> & { sideOffset?: number }
    >(({ children, sideOffset: _sideOffset, ...props }, ref) => (
      <div ref={ref} role="menu" {...props}>
        {children}
      </div>
    )),
    Item: ReactModule.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { onSelect?: () => void }>(
      ({ children, onClick, onSelect, ...props }, ref) => (
        <BaseItem
          ref={ref}
          onClick={(event) => {
            onClick?.(event);
            onSelect?.();
          }}
          {...props}
        >
          {children}
        </BaseItem>
      ),
    ),
    CheckboxItem: withForwardRef<HTMLDivElement>("div", "menuitemcheckbox"),
    RadioItem: withForwardRef<HTMLDivElement>("div", "menuitemradio"),
    Label: withForwardRef<HTMLDivElement>("div"),
    Separator: withForwardRef<HTMLHRElement>("hr", "separator"),
    ItemIndicator: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  };
});

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

describe("ui/dropdown-menu", () => {
  it("renderiza estrutura principal e executa onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel inset>Arquivo</DropdownMenuLabel>
          <DropdownMenuItem inset onSelect={onSelect}>
            Copiar
            <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    const item = screen.getByRole("menuitem", { name: /copiar/i });
    expect(item.className).toContain("pl-8");
    expect(screen.getByText("⌘C")).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();

    await user.click(item);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renderiza itens checkbox/radio e submenu", () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Abrir</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked>Mostrar painel</DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value="a">
            <DropdownMenuRadioItem value="a">Opção A</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="b">Opção B</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger inset>Mais opções</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Renomear</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(screen.getByRole("menuitemcheckbox", { name: /mostrar painel/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /opção a/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /mais opções/i }).className).toContain("pl-8");
    expect(screen.getByRole("menuitem", { name: /renomear/i })).toBeInTheDocument();
  });
});
