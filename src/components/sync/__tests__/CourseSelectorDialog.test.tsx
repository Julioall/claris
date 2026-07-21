import type { ComponentProps } from "react";
import type { Course } from "@/features/courses/types";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseSelectorDialog } from "@/components/sync/CourseSelectorDialog";

const useAuthMock = vi.fn();
const fetchStudentCountsByCourseIdsMock = vi.fn();
const fetchUserSyncPreferencesMock = vi.fn();
const saveUserSyncPreferencesMock = vi.fn();

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/features/courses/api", () => ({
  fetchStudentCountsByCourseIds: (...args: unknown[]) => fetchStudentCountsByCourseIdsMock(...args),
  fetchUserSyncPreferences: (...args: unknown[]) => fetchUserSyncPreferencesMock(...args),
  saveUserSyncPreferences: (...args: unknown[]) => saveUserSyncPreferencesMock(...args),
}));

function buildCourse(overrides: Partial<Course>): Course {
  return {
    id: "course-id",
    moodle_course_id: "100",
    name: "Course",
    category: "Instituicao > Escola > Evento > Turma",
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const coursesFixture: Course[] = [
  buildCourse({
    id: "c1",
    moodle_course_id: "101",
    name: "Turma A1",
    category: "Instituicao > Escola A > Evento A > Turma 1",
    end_date: "2099-01-01T00:00:00.000Z",
  }),
  buildCourse({
    id: "c2",
    moodle_course_id: "102",
    name: "Turma A2",
    category: "Instituicao > Escola A > Evento A > Turma 2",
    end_date: "2020-01-01T00:00:00.000Z",
  }),
  buildCourse({
    id: "c3",
    moodle_course_id: "103",
    name: "Turma B1",
    category: "Instituicao > Escola B > Evento B > Turma 1",
    end_date: "2020-01-01T00:00:00.000Z",
  }),
  buildCourse({
    id: "c4",
    moodle_course_id: "104",
    name: "Turma C1",
    category: "Instituicao > Escola C > Evento C > Turma 1",
  }),
];

function renderDialog(
  props: Partial<ComponentProps<typeof CourseSelectorDialog>> = {},
) {
  const onOpenChange = vi.fn();
  const onSync = vi.fn();

  render(
    <CourseSelectorDialog
      open
      onOpenChange={onOpenChange}
      onSync={onSync}
      courses={coursesFixture}
      {...props}
    />,
  );

  return { onOpenChange, onSync };
}

describe("CourseSelectorDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: "user-1" } });
    fetchStudentCountsByCourseIdsMock.mockResolvedValue(new Map([
      ["c1", 2],
      ["c2", 1],
      ["c3", 1],
      ["c4", 0],
    ]));
    fetchUserSyncPreferencesMock.mockResolvedValue(null);
    saveUserSyncPreferencesMock.mockResolvedValue(undefined);
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("shows empty state when there are no courses", async () => {
    renderDialog({ courses: [] });
    expect(await screen.findByText(/Nenhum curso dispon/i)).toBeInTheDocument();
  });

  it("syncs selected event courses and persists preferences", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onSync } = renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/2 cursos selecionados/i)).toBeInTheDocument();
    });

    expect(screen.queryByText("Evento C")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Sincronizar$/i }));

    expect(onSync).toHaveBeenCalledWith(["c1", "c2"]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(saveUserSyncPreferencesMock).toHaveBeenCalledWith({
      includeEmptyCourses: false,
      includeFinished: false,
      selectedKeys: ["Escola A::Evento A"],
    });
  });

  it("allows clearing and selecting all events before syncing", async () => {
    const user = userEvent.setup();
    const { onSync } = renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/2 cursos selecionados/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Limpar sele/i }));
    expect(screen.getByRole("button", { name: /^Sincronizar$/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Selecionar todos/i }));
    expect(screen.getByRole("button", { name: /^Sincronizar$/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /^Sincronizar$/i }));

    expect(onSync).toHaveBeenCalledWith(expect.arrayContaining(["c1", "c2"]));
    expect(onSync.mock.calls[0][0]).toHaveLength(2);
  });

  it("loads saved preferences and includes finished courses when enabled", async () => {
    const user = userEvent.setup();
    fetchUserSyncPreferencesMock.mockResolvedValueOnce({
      selectedKeys: ["Escola B::Evento B", "Escola C::Evento C"],
      includeEmptyCourses: true,
      includeFinished: true,
    });

    const { onSync } = renderDialog();

    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: /Incluir finalizados/i }),
      ).toBeChecked();
    });

    await user.click(screen.getByRole("button", { name: /^Sincronizar$/i }));
    expect(onSync).toHaveBeenCalledWith(["c3", "c4"]);
  });
});
