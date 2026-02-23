import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@radix-ui/react-menubar", async () => {
  const ReactModule = await import("react");

  const withForwardRef = <T extends HTMLElement>(
    element: keyof JSX.IntrinsicElements,
    role?: string,
  ) =>
    ReactModule.forwardRef<T, React.HTMLAttributes<T>>(({ children, ...props }, ref) =>
      ReactModule.createElement(element, { ref, role, ...props }, children),
    );

  const BaseItem = withForwardRef<HTMLDivElement>("div", "menuitem");

  return {
    Menu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Group: ({ children }: { children?: React.ReactNode }) => <div role="group">{children}</div>,
    Portal: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Sub: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    RadioGroup: ({ children }: { children?: React.ReactNode }) => <div role="group">{children}</div>,
    Root: withForwardRef<HTMLDivElement>("div", "menubar"),
    Trigger: withForwardRef<HTMLButtonElement>("button"),
    SubTrigger: withForwardRef<HTMLDivElement>("div", "menuitem"),
    SubContent: withForwardRef<HTMLDivElement>("div"),
    Content: ReactModule.forwardRef<
      HTMLDivElement,
      React.HTMLAttributes<HTMLDivElement> & { align?: string; alignOffset?: number; sideOffset?: number }
    >(({ children, align: _align, alignOffset: _alignOffset, sideOffset: _sideOffset, ...props }, ref) => (
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
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar";

describe("ui/menubar", () => {
  it("renderiza gatilho, conteúdo e executa onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <Menubar className="custom-menubar">
        <MenubarMenu>
          <MenubarTrigger>Arquivo</MenubarTrigger>
          <MenubarContent>
            <MenubarLabel inset>Opções</MenubarLabel>
            <MenubarItem inset onSelect={onSelect}>
              Copiar
              <MenubarShortcut>⌘C</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    const root = screen.getByRole("menubar");
    expect(root.className).toContain("h-10");
    expect(root.className).toContain("custom-menubar");

    const item = screen.getByRole("menuitem", { name: /copiar/i });
    expect(item.className).toContain("pl-8");
    expect(screen.getByText("⌘C")).toBeInTheDocument();

    await user.click(item);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renderiza checkbox, radio e submenu", () => {
    render(
      <Menubar>
        <MenubarMenu>
          <MenubarContent>
            <MenubarCheckboxItem checked>Mostrar status</MenubarCheckboxItem>
            <MenubarRadioGroup>
              <MenubarRadioItem value="a">Opção A</MenubarRadioItem>
            </MenubarRadioGroup>
            <MenubarSub>
              <MenubarSubTrigger inset>Mais ações</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem>Renomear</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    expect(screen.getByRole("menuitemcheckbox", { name: /mostrar status/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /opção a/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /mais ações/i }).className).toContain("pl-8");
    expect(screen.getByRole("menuitem", { name: /renomear/i })).toBeInTheDocument();
  });
});
