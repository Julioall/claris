import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { APP_PERMISSIONS } from "@/lib/access-control";

const ROUTER_FUTURE = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const useAuthMock = vi.fn();
const useSidebarMock = vi.fn();
const usePermissionsMock = vi.fn();
const logoutMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => usePermissionsMock(),
}));

vi.mock("@/components/support/SupportButton", () => ({
  SupportButton: ({ showLabel }: { showLabel?: boolean }) => (
    <button type="button">{showLabel ? "Suporte" : ""}</button>
  ),
}));

vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
  SidebarContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarGroup: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  SidebarGroupContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarMenu: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  SidebarMenuButton: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarMenuItem: ({ children }: { children: ReactNode }) => <li>{children}</li>,
  SidebarHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  SidebarFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  SidebarMenuSub: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  SidebarMenuSubButton: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarMenuSubItem: ({ children }: { children: ReactNode }) => <li>{children}</li>,
  useSidebar: () => useSidebarMock(),
}));

vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function renderSidebar() {
  return render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <AppSidebar />
    </MemoryRouter>,
  );
}

describe("AppSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      user: {
        full_name: "Julio Tutor",
        moodle_username: "julio",
      },
      logout: logoutMock,
    });
    useSidebarMock.mockReturnValue({ state: "expanded" });
    usePermissionsMock.mockReturnValue({
      isAdmin: false,
      isLoading: false,
      isFetching: false,
      role: "tutor",
      group: { id: "group-1", name: "Tutor", slug: "tutor" },
      permissions: Object.values(APP_PERMISSIONS),
      refresh: vi.fn(),
      can: () => true,
      canAny: () => true,
      canAccessAdminSection: () => false,
    });
  });

  it("renders navigation and user info when expanded", () => {
    renderSidebar();

    expect(screen.getByText("Claris")).toBeInTheDocument();
    expect(screen.getByText("Menu Principal")).toBeInTheDocument();
    expect(screen.getByText("Resumo da Semana")).toBeInTheDocument();
    expect(screen.getByText("Meus Cursos")).toBeInTheDocument();
    expect(screen.getByText("Escolas")).toBeInTheDocument();
    expect(screen.getByText("Alunos")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Campanhas")).toBeInTheDocument();
    expect(screen.getByText("Claris IA")).toBeInTheDocument();
    expect(screen.getByText("Relatorios")).toBeInTheDocument();
    expect(screen.getByText("Configuracoes")).toBeInTheDocument();
    expect(screen.getByText("Suporte")).toBeInTheDocument();
    expect(screen.getByText("Julio Tutor")).toBeInTheDocument();
    expect(screen.getByText("julio")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /resumo da semana/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: /meus cursos/i })).toHaveAttribute(
      "href",
      "/meus-cursos",
    );
    expect(screen.getByRole("link", { name: /claris ia/i })).toHaveAttribute(
      "href",
      "/claris",
    );
    expect(screen.getByRole("link", { name: /whatsapp/i })).toHaveAttribute(
      "href",
      "/whatsapp",
    );
    expect(screen.getByRole("link", { name: /campanhas/i })).toHaveAttribute(
      "href",
      "/campanhas",
    );
  });

  it("hides labels when sidebar is collapsed and handles logout", async () => {
    const user = userEvent.setup();
    useSidebarMock.mockReturnValue({ state: "collapsed" });

    renderSidebar();

    expect(screen.queryByText("Menu Principal")).not.toBeInTheDocument();
    expect(screen.queryByText("Julio Tutor")).not.toBeInTheDocument();
    expect(screen.getByTitle("Sair")).toBeInTheDocument();

    await user.click(screen.getByTitle("Sair"));

    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});
