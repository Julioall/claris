import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseAttendanceTab } from "@/components/attendance/CourseAttendanceTab";

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const recordsOrderMock = vi.fn();
const dateRecordsOrderMock = vi.fn();
const studentsEqMock = vi.fn();
const upsertMock = vi.fn();
const toastMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

describe("CourseAttendanceTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: "u-1" } });

    recordsOrderMock.mockResolvedValue({ data: [], error: null });
    dateRecordsOrderMock.mockResolvedValue({ data: [], error: null });
    studentsEqMock.mockResolvedValue({ data: [], error: null });
    upsertMock.mockResolvedValue({ error: null });

    fromMock.mockImplementation((table: string) => {
      if (table === "attendance_records") {
        return {
          select: (columns: string) => {
            if (columns.includes("students")) {
              return {
                eq: () => ({
                  eq: () => ({ order: recordsOrderMock }),
                }),
              };
            }

            return {
              eq: () => ({
                eq: () => ({
                  eq: () => ({ order: dateRecordsOrderMock }),
                }),
              }),
            };
          },
          upsert: upsertMock,
        };
      }

      if (table === "student_courses") {
        return {
          select: () => ({ eq: studentsEqMock }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("renders grouped attendance stats and latest details", async () => {
    recordsOrderMock.mockResolvedValueOnce({
      data: [
        {
          id: "r-1",
          attendance_date: "2026-02-23",
          status: "presente",
          notes: "Participativo",
          students: { id: "s-1", full_name: "Ana Silva" },
        },
        {
          id: "r-2",
          attendance_date: "2026-02-23",
          status: "ausente",
          notes: null,
          students: { id: "s-2", full_name: "Bruno Lima" },
        },
      ],
      error: null,
    });

    studentsEqMock.mockResolvedValueOnce({
      data: [
        { students: { id: "s-1", full_name: "Ana Silva", email: "ana@example.com" } },
        { students: { id: "s-2", full_name: "Bruno Lima", email: "bruno@example.com" } },
      ],
      error: null,
    });

    render(<CourseAttendanceTab courseId="c-1" />);

    await waitFor(() => {
      expect(screen.getByText(/registros de presença/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText(/23\/02\/2026/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Presente:\s*1/i)).toBeInTheDocument();
    expect(screen.getByText(/Ausente:\s*1/i)).toBeInTheDocument();
    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
  });

  it("shows warning toast when trying to save without selecting any status", async () => {
    const user = userEvent.setup();

    studentsEqMock.mockResolvedValueOnce({
      data: [{ students: { id: "s-1", full_name: "Ana Silva", email: null } }],
      error: null,
    });

    render(<CourseAttendanceTab courseId="c-1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /nova presença/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /nova presença/i }));
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(upsertMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/nenhum registro para salvar/i) }),
    );
  });

  it("saves attendance with selected status and note", async () => {
    const user = userEvent.setup();

    studentsEqMock.mockResolvedValueOnce({
      data: [{ students: { id: "s-1", full_name: "Ana Silva", email: null } }],
      error: null,
    });

    recordsOrderMock
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [
          {
            id: "r-1",
            attendance_date: "2026-02-23",
            status: "presente",
            notes: "Chegou no horario",
            students: { id: "s-1", full_name: "Ana Silva" },
          },
        ],
        error: null,
      });

    render(<CourseAttendanceTab courseId="c-1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /nova presença/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /nova presença/i }));

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /^Presente$/i }));

    await user.type(screen.getByPlaceholderText(/observação \(opcional\)/i), "Chegou no horario");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() => {
      expect(upsertMock).toHaveBeenCalledTimes(1);
    });

    expect(upsertMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          user_id: "u-1",
          course_id: "c-1",
          student_id: "s-1",
          status: "presente",
          notes: "Chegou no horario",
        }),
      ],
      { onConflict: "user_id,course_id,student_id,attendance_date" },
    );

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/presenças salvas/i) }),
    );
  });
});
