import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const isMobileMock = vi.fn();

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => isMobileMock(),
}));

function SidebarStateProbe() {
  const { open, state } = useSidebar();
  return <span>{`sidebar-${open}-${state}`}</span>;
}

describe("ui/sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileMock.mockReturnValue(false);
    document.cookie = "";
  });

  it("throws when useSidebar is used outside provider", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const Broken = () => {
      useSidebar();
      return null;
    };

    expect(() => render(<Broken />)).toThrow(/useSidebar must be used within a SidebarProvider/i);

    consoleErrorSpy.mockRestore();
  });

  it("toggles sidebar by trigger click and keyboard shortcut", async () => {
    const user = userEvent.setup();

    render(
      <SidebarProvider defaultOpen>
        <SidebarStateProbe />
        <SidebarTrigger />
        <Sidebar>
          <SidebarContent>
            <span>conteudo</span>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>,
    );

    expect(screen.getByText("sidebar-true-expanded")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /toggle sidebar/i }));
    expect(screen.getByText("sidebar-false-collapsed")).toBeInTheDocument();
    expect(document.cookie).toContain("sidebar:state=false");

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(screen.getByText("sidebar-true-expanded")).toBeInTheDocument();
  });

  it("renders basic composition and data-sidebar attributes", () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <Sidebar collapsible="none">
          <SidebarHeader>Header</SidebarHeader>
          <SidebarInput placeholder="Buscar" />
          <SidebarSeparator />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Grupo</SidebarGroupLabel>
              <SidebarGroupAction aria-label="acao-grupo">+</SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Tooltip item">Item</SidebarMenuButton>
                    <SidebarMenuAction aria-label="acao-item">!</SidebarMenuAction>
                    <SidebarMenuBadge>3</SidebarMenuBadge>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton href="#">Subitem</SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>Footer</SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>Inset</SidebarInset>
      </SidebarProvider>,
    );

    expect(screen.getByText("Header")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buscar")).toHaveAttribute("data-sidebar", "input");
    expect(screen.getByText("Grupo")).toHaveAttribute("data-sidebar", "group-label");
    expect(screen.getByText("Item")).toHaveAttribute("data-sidebar", "menu-button");
    expect(screen.getByText("Subitem")).toHaveAttribute("data-sidebar", "menu-sub-button");
    expect(screen.getByText("Inset")).toBeInTheDocument();
  });

  it("renders mobile sheet variant when in mobile mode", async () => {
    const user = userEvent.setup();
    isMobileMock.mockReturnValue(true);

    render(
      <SidebarProvider defaultOpen>
        <SidebarTrigger />
        <Sidebar>
          <SidebarContent>
            <span>menu mobile</span>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>,
    );

    await user.click(screen.getByRole("button", { name: /toggle sidebar/i }));

    expect(await screen.findByText("menu mobile")).toBeInTheDocument();
  });
});
