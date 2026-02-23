import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@radix-ui/react-context-menu", async () => {
  const ReactModule = await import("react");

  const withForwardRef = <T extends HTMLElement>(
    element: keyof JSX.IntrinsicElements,
    role?: string,
  ) =>
    ReactModule.forwardRef<T, React.HTMLAttributes<T> & { checked?: boolean }>(({ children, ...props }, ref) =>
      ReactModule.createElement(element, { ref, role, ...props }, children),
    );

  const ItemIndicator = ({ children }: { children?: React.ReactNode }) => <span>{children}</span>;

  const Item = withForwardRef<HTMLDivElement>("div", "menuitem");
  const CheckboxItem = withForwardRef<HTMLDivElement>("div", "menuitemcheckbox");
  const RadioItem = withForwardRef<HTMLDivElement>("div", "menuitemradio");

  return {
    Root: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Trigger: withForwardRef<HTMLSpanElement>("span"),
    Group: ({ children }: { children?: React.ReactNode }) => <div role="group">{children}</div>,
    Portal: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Sub: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    RadioGroup: ({ children }: { children?: React.ReactNode }) => <div role="group">{children}</div>,
    SubTrigger: withForwardRef<HTMLDivElement>("div", "menuitem"),
    SubContent: withForwardRef<HTMLDivElement>("div"),
    Content: withForwardRef<HTMLDivElement>("div", "menu"),
    Item: ReactModule.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { onSelect?: () => void }>(
      ({ children, onClick, onSelect, ...props }, ref) => (
        <Item
          ref={ref}
          onClick={(event) => {
            onClick?.(event);
            onSelect?.();
          }}
          {...props}
        >
          {children}
        </Item>
      ),
    ),
    CheckboxItem,
    RadioItem,
    Label: withForwardRef<HTMLDivElement>("div"),
    Separator: withForwardRef<HTMLHRElement>("hr", "separator"),
    ItemIndicator,
  };
});

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

describe("ui/context-menu", () => {
  it("abre o menu de contexto e dispara ação de item", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <ContextMenu>
        <ContextMenuTrigger data-testid="trigger">Abrir</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuLabel inset>Arquivo</ContextMenuLabel>
          <ContextMenuItem inset onSelect={onSelect}>
            Copiar
            <ContextMenuShortcut>⌘C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
        </ContextMenuContent>
      </ContextMenu>,
    );

    expect(screen.getByTestId("trigger")).toBeInTheDocument();
    const item = screen.getByRole("menuitem", { name: /copiar/i });
    expect(screen.getByText("⌘C")).toBeInTheDocument();

    await user.click(item);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renderiza checkbox, radio e submenu", async () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger data-testid="trigger-advanced">Abrir avançado</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuCheckboxItem checked>Exibir painel</ContextMenuCheckboxItem>
          <ContextMenuRadioGroup value="a">
            <ContextMenuRadioItem value="a">Opção A</ContextMenuRadioItem>
            <ContextMenuRadioItem value="b">Opção B</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger inset>Mais ações</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem>Renomear</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenu>,
    );

    expect(screen.getByTestId("trigger-advanced")).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: /exibir painel/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /opção a/i })).toBeInTheDocument();

    expect(screen.getByRole("menuitem", { name: /mais ações/i })).toBeInTheDocument();
  });
});
