import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

describe("ui/command", () => {
  it("renders command primitives and shortcut", async () => {
    const user = userEvent.setup();

    render(
      <Command>
        <CommandInput placeholder="Buscar comando" />
        <CommandList>
          <CommandEmpty>Nada encontrado</CommandEmpty>
          <CommandGroup heading="Ações">
            <CommandItem>Sincronizar</CommandItem>
            <CommandSeparator />
            <CommandItem>
              Configurações
              <CommandShortcut>⌘K</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>,
    );

    const input = screen.getByPlaceholderText(/buscar comando/i);
    expect(input).toBeInTheDocument();

    expect(screen.getByText("Sincronizar")).toBeInTheDocument();
    expect(screen.getByText("Configurações")).toBeInTheDocument();
    expect(screen.getByText("⌘K")).toBeInTheDocument();

    await user.type(input, "zzzz");
    expect((input as HTMLInputElement).value).toBe("zzzz");
    expect(screen.getByText(/nada encontrado/i)).toBeInTheDocument();
  });

  it("renders command dialog content when open", () => {
    render(
      <CommandDialog open>
        <CommandInput placeholder="Pesquisar" />
        <CommandList>
          <CommandItem>Item do diálogo</CommandItem>
        </CommandList>
      </CommandDialog>,
    );

    expect(screen.getByPlaceholderText(/pesquisar/i)).toBeInTheDocument();
    expect(screen.getByText(/item do diálogo/i)).toBeInTheDocument();
  });
});
