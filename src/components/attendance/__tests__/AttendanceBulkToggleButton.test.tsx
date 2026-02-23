import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendanceBulkToggleButton } from "@/components/attendance/AttendanceBulkToggleButton";

const toastSuccessMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

describe("AttendanceBulkToggleButton", () => {
  it("returns null when callback is not provided", () => {
    const { container } = render(
      <AttendanceBulkToggleButton
        courses={[{ id: "c-1", is_attendance_enabled: false }]}
        level="curso"
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("shows disable text when all are enabled and toggles off", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <AttendanceBulkToggleButton
        courses={[
          { id: "c-1", is_attendance_enabled: true },
          { id: "c-2", is_attendance_enabled: true },
        ]}
        level="curso"
        onToggleAttendanceMultiple={onToggle}
      />,
    );

    await user.click(screen.getByRole("button", { name: /desmarcar presenca/i }));

    expect(onToggle).toHaveBeenCalledWith(["c-1", "c-2"], false);
    expect(toastSuccessMock).toHaveBeenCalledWith("Presenca desativada para curso");
  });

  it("shows mark remaining text when some are enabled", () => {
    render(
      <AttendanceBulkToggleButton
        courses={[
          { id: "c-1", is_attendance_enabled: true },
          { id: "c-2", is_attendance_enabled: false },
        ]}
        level="turma"
        onToggleAttendanceMultiple={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /marcar restante/i })).toBeInTheDocument();
  });

  it("shows mark attendance text when none are enabled", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <AttendanceBulkToggleButton
        courses={[
          { id: "c-1", is_attendance_enabled: false },
          { id: "c-2", is_attendance_enabled: false },
        ]}
        level="escola"
        onToggleAttendanceMultiple={onToggle}
      />,
    );

    await user.click(screen.getByRole("button", { name: /marcar presenca/i }));

    expect(onToggle).toHaveBeenCalledWith(["c-1", "c-2"], true);
    expect(toastSuccessMock).toHaveBeenCalledWith("Presenca ativada para escola");
  });
});
