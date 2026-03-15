import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AppLayout } from "@/components/layout/AppLayout";

const useAuthMock = vi.fn();
const closeSyncProgressMock = vi.fn();
const setShowCourseSelectorMock = vi.fn();
const syncSelectedCoursesMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="sidebar-provider">{children}</div>
  ),
}));

vi.mock("@/components/layout/AppSidebar", () => ({
  AppSidebar: () => <div data-testid="app-sidebar" />,
}));

vi.mock("@/components/layout/TopBar", () => ({
  TopBar: () => <div data-testid="top-bar" />,
}));

vi.mock("@/components/sync/CourseSelectorDialog", () => ({
  CourseSelectorDialog: ({ open }: { open: boolean }) => (
    <div data-testid="course-selector-dialog">open:{String(open)}</div>
  ),
}));

vi.mock("@/components/sync/SyncProgressDialog", () => ({
  SyncProgressDialog: ({ open }: { open: boolean }) => (
    <div data-testid="sync-progress-dialog">open:{String(open)}</div>
  ),
}));

vi.mock("@/components/layout/FloatingClarisChat", () => ({
  FloatingClarisChat: () => <div data-testid="floating-claris-chat" />,
}));

function renderPage(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/claris" element={<div>Claris Page</div>} />
          <Route path="/" element={<div>Layout Child</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      syncProgress: {
        isOpen: true,
        steps: [],
        currentStep: null,
        isComplete: false,
        summary: undefined,
      },
      closeSyncProgress: closeSyncProgressMock,
      courses: [{ id: "c-1" }],
      syncSelectedCourses: syncSelectedCoursesMock,
      showCourseSelector: true,
      setShowCourseSelector: setShowCourseSelectorMock,
      isSyncing: false,
    });
  });

  it("renders app shell when authenticated", () => {
    renderPage();

    expect(screen.getByTestId("sidebar-provider")).toBeInTheDocument();
    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("top-bar")).toBeInTheDocument();
    expect(screen.getByText("Layout Child")).toBeInTheDocument();
    expect(screen.getByTestId("course-selector-dialog")).toHaveTextContent("open:true");
    expect(screen.getByTestId("sync-progress-dialog")).toHaveTextContent("open:true");
    expect(screen.getByTestId("floating-claris-chat")).toBeInTheDocument();
  });

  it("hides floating chat on the dedicated claris route", () => {
    renderPage("/claris");

    expect(screen.getByText("Claris Page")).toBeInTheDocument();
    expect(screen.queryByTestId("floating-claris-chat")).not.toBeInTheDocument();
  });

  it("renders only outlet content when not authenticated", () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      syncProgress: {
        isOpen: false,
        steps: [],
        currentStep: null,
        isComplete: false,
        summary: undefined,
      },
      closeSyncProgress: closeSyncProgressMock,
      courses: [],
      syncSelectedCourses: syncSelectedCoursesMock,
      showCourseSelector: false,
      setShowCourseSelector: setShowCourseSelectorMock,
      isSyncing: false,
    });

    renderPage();

    expect(screen.getByText("Layout Child")).toBeInTheDocument();
    expect(screen.queryByTestId("app-sidebar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("top-bar")).not.toBeInTheDocument();
  });
});
