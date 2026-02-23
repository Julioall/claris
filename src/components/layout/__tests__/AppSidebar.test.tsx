import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppSidebar } from "@/components/layout/AppSidebar";

const useAuthMock = vi.fn();
const useSidebarMock = vi.fn();
const logoutMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
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
  useSidebar: () => useSidebarMock(),
}));

function renderSidebar() {
  return render(
    <MemoryRouter>
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
  });

  it("renders navigation and user info when expanded", () => {
    renderSidebar();

    expect(screen.getByAltText("ACTiM")).toBeInTheDocument();
    expect(screen.getByText("Meus Cursos")).toBeInTheDocument();
    expect(screen.getByText("Escolas")).toBeInTheDocument();
    expect(screen.getByText("Alunos")).toBeInTheDocument();
    expect(screen.getByText("Julio Tutor")).toBeInTheDocument();
    expect(screen.getByText("julio")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /meus cursos/i })).toHaveAttribute(
      "href",
      "/meus-cursos",
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
