import type { ComponentProps } from "react";
import type { Course } from "@/types";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseSelectorDialog } from "@/components/sync/CourseSelectorDialog";

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const studentCoursesSelectMock = vi.fn();
const studentCoursesInMock = vi.fn();
const prefsSelectMock = vi.fn();
const prefsEqMock = vi.fn();
const prefsMaybeSingleMock = vi.fn();
const prefsUpsertMock = vi.fn();

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
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
  }),
  buildCourse({
    id: "c2",
    moodle_course_id: "102",
    name: "Turma A2",
    category: "Instituicao > Escola A > Evento A > Turma 2",
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

    fromMock.mockImplementation((table: string) => {
      if (table === "student_courses") {
        return { select: studentCoursesSelectMock };
      }

      if (table === "user_sync_preferences") {
        return { select: prefsSelectMock, upsert: prefsUpsertMock };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    studentCoursesSelectMock.mockReturnValue({ in: studentCoursesInMock });
    studentCoursesInMock.mockResolvedValue({
      data: [
        { course_id: "c1" },
        { course_id: "c1" },
        { course_id: "c2" },
        { course_id: "c3" },
      ],
      error: null,
    });

    prefsSelectMock.mockReturnValue({ eq: prefsEqMock });
    prefsEqMock.mockReturnValue({ maybeSingle: prefsMaybeSingleMock });
    prefsMaybeSingleMock.mockResolvedValue({ data: null });
    prefsUpsertMock.mockResolvedValue({ error: null });
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
      expect(screen.getByText(/3 cursos selecionados/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^Sincronizar$/i }));

    expect(onSync).toHaveBeenCalledWith(["c1", "c2", "c4"]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(prefsUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        include_empty_courses: false,
        include_finished: false,
        selected_keys: expect.arrayContaining(["Escola A::Evento A"]),
      }),
      { onConflict: "user_id" },
    );
  });

  it("allows clearing and selecting all events before syncing", async () => {
    const user = userEvent.setup();
    const { onSync } = renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/3 cursos selecionados/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Limpar sele/i }));
    expect(screen.getByRole("button", { name: /^Sincronizar$/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Selecionar todos/i }));
    expect(screen.getByRole("button", { name: /^Sincronizar$/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /^Sincronizar$/i }));

    expect(onSync).toHaveBeenCalledWith(expect.arrayContaining(["c1", "c2", "c4"]));
    expect(onSync.mock.calls[0][0]).toHaveLength(3);
  });

  it("loads saved preferences and includes finished courses when enabled", async () => {
    const user = userEvent.setup();
    prefsMaybeSingleMock.mockResolvedValueOnce({
      data: {
        selected_keys: ["Escola B::Evento B"],
        include_empty_courses: false,
        include_finished: true,
      },
    });

    const { onSync } = renderDialog();

    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: /Incluir finalizados/i }),
      ).toBeChecked();
    });

    await user.click(screen.getByRole("button", { name: /^Sincronizar$/i }));
    expect(onSync).toHaveBeenCalledWith(["c3"]);
  });
});
