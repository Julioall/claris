import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportsPage from "@/features/reports/pages/ReportsPage";

const useAuthMock = vi.fn();
const fetchTutorCoursesMock = vi.fn();
const fetchAllReportEnrollmentsMock = vi.fn();
const fetchAllReportActivityDetailsMock = vi.fn();
const fetchAllReportActivityGradesMock = vi.fn();
const fetchAllReportCourseTotalsMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const toastInfoMock = vi.fn();
const jsonToSheetMock = vi.fn();
const decodeRangeMock = vi.fn();
const encodeCellMock = vi.fn();
const bookNewMock = vi.fn();
const bookAppendSheetMock = vi.fn();
const writeFileMock = vi.fn();

const columnIndexToLabel = (columnIndex: number) => {
  let currentIndex = columnIndex + 1;
  let label = "";

  while (currentIndex > 0) {
    const remainder = (currentIndex - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    currentIndex = Math.floor((currentIndex - 1) / 26);
  }

  return label;
};

const encodeCellAddress = ({ r, c }: { r: number; c: number }) => `${columnIndexToLabel(c)}${r + 1}`;

const decodeCellAddress = (cellAddress: string) => {
  const match = cellAddress.match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    throw new Error(`Invalid cell address: ${cellAddress}`);
  }

  const [, columnLabel, rowLabel] = match;
  let columnIndex = 0;

  for (const char of columnLabel) {
    columnIndex = (columnIndex * 26) + (char.charCodeAt(0) - 64);
  }

  return {
    c: columnIndex - 1,
    r: Number(rowLabel) - 1,
  };
};

const decodeWorksheetRange = (worksheetRange: string) => {
  const [startCell, endCell = startCell] = worksheetRange.split(":");

  return {
    s: decodeCellAddress(startCell),
    e: decodeCellAddress(endCell),
  };
};

const buildWorksheet = (rows: Array<Record<string, unknown>>) => {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const worksheet: Record<string, { v: unknown; s?: Record<string, unknown>; z?: string }> & { "!ref"?: string } = {};

  if (headers.length === 0) {
    worksheet["!ref"] = "A1";
    return worksheet;
  }

  headers.forEach((header, columnIndex) => {
    worksheet[encodeCellAddress({ r: 0, c: columnIndex })] = { v: header };
  });

  rows.forEach((row, rowIndex) => {
    headers.forEach((header, columnIndex) => {
      worksheet[encodeCellAddress({ r: rowIndex + 1, c: columnIndex })] = {
        v: row[header],
      };
    });
  });

  worksheet["!ref"] = `A1:${encodeCellAddress({ r: rows.length, c: headers.length - 1 })}`;

  return worksheet;
};

const daysAgoIso = (days: number) => new Date(Date.now() - (((days * 24) + 1) * 60 * 60 * 1000)).toISOString();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/features/reports/api", () => ({
  fetchTutorCourses: (...args: unknown[]) => fetchTutorCoursesMock(...args),
  fetchAllReportEnrollments: (...args: unknown[]) => fetchAllReportEnrollmentsMock(...args),
  fetchAllReportActivityDetails: (...args: unknown[]) => fetchAllReportActivityDetailsMock(...args),
  fetchAllReportActivityGrades: (...args: unknown[]) => fetchAllReportActivityGradesMock(...args),
  fetchAllReportCourseTotals: (...args: unknown[]) => fetchAllReportCourseTotalsMock(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
    info: (...args: unknown[]) => toastInfoMock(...args),
  },
}));

vi.mock("xlsx-js-style", () => ({
  utils: {
    json_to_sheet: (...args: unknown[]) => jsonToSheetMock(...args),
    decode_range: (...args: unknown[]) => decodeRangeMock(...args),
    encode_cell: (...args: unknown[]) => encodeCellMock(...args),
    book_new: (...args: unknown[]) => bookNewMock(...args),
    book_append_sheet: (...args: unknown[]) => bookAppendSheetMock(...args),
  },
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}));

const tutorCoursesResponse = [
  {
    id: "course-1",
    name: "Matematica",
    short_name: "MAT",
    category: "Turma A",
    start_date: "2020-01-10T00:00:00.000Z",
    end_date: "2099-12-10T00:00:00.000Z",
  },
];

const enrollmentsResponse = [
  {
    student_id: "student-1",
    course_id: "course-1",
    enrollment_status: "ativo",
    students: { full_name: "Ana Silva", last_access: daysAgoIso(1) },
  },
  {
    student_id: "student-2",
    course_id: "course-1",
    enrollment_status: "ativo",
    students: { full_name: "Carla Dias", last_access: daysAgoIso(5) },
  },
  {
    student_id: "student-3",
    course_id: "course-1",
    enrollment_status: "ativo",
    students: { full_name: "Diego Lima", last_access: daysAgoIso(9) },
  },
  {
    student_id: "student-4",
    course_id: "course-1",
    enrollment_status: "suspenso",
    students: { full_name: "Bruno Souza", last_access: daysAgoIso(12) },
  },
];

const activitiesResponse = [
  {
    student_id: "student-1",
    course_id: "course-1",
    moodle_activity_id: "activity-1",
    activity_name: "Trabalho Final",
    activity_type: "assign",
    grade: null,
    grade_max: 100,
    hidden: false,
    status: "pending",
    due_date: null,
    completed_at: null,
    graded_at: null,
    submitted_at: null,
  },
  {
    student_id: "student-1",
    course_id: "course-1",
    moodle_activity_id: "activity-2",
    activity_name: "Forum de Apresentacao",
    activity_type: "forum",
    grade: null,
    grade_max: 0,
    hidden: false,
    status: "pending",
    due_date: null,
    completed_at: null,
    graded_at: null,
    submitted_at: null,
  },
  {
    student_id: "student-4",
    course_id: "course-1",
    moodle_activity_id: "activity-3",
    activity_name: "Avaliacao Suspensa",
    activity_type: "assign",
    grade: null,
    grade_max: 100,
    hidden: false,
    status: "submitted",
    due_date: null,
    completed_at: null,
    graded_at: null,
    submitted_at: "2026-03-11T09:00:00.000Z",
  },
  {
    student_id: "student-2",
    course_id: "course-1",
    moodle_activity_id: "activity-4",
    activity_name: "Projeto Aplicado",
    activity_type: "assign",
    grade: null,
    grade_max: 100,
    hidden: false,
    status: "completed",
    due_date: null,
    completed_at: "2026-03-12T10:00:00.000Z",
    graded_at: null,
    submitted_at: "2026-03-12T10:00:00.000Z",
  },
];

const courseTotalsResponse = [
  {
    student_id: "student-1",
    course_id: "course-1",
    grade_raw: 18,
    grade_percentage: 90,
  },
  {
    student_id: "student-2",
    course_id: "course-1",
    grade_raw: 11,
    grade_percentage: 55,
  },
  {
    student_id: "student-3",
    course_id: "course-1",
    grade_raw: 7,
    grade_percentage: 35,
  },
  {
    student_id: "student-4",
    course_id: "course-1",
    grade_raw: 16,
    grade_percentage: 80,
  },
];

describe("Reports page", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: "user-1" } });

    jsonToSheetMock.mockImplementation((rows: Array<Record<string, unknown>>) => buildWorksheet(rows));
    decodeRangeMock.mockImplementation((worksheetRange: string) => decodeWorksheetRange(worksheetRange));
    encodeCellMock.mockImplementation((cell: { r: number; c: number }) => encodeCellAddress(cell));
    bookNewMock.mockReturnValue({});

    fetchTutorCoursesMock.mockResolvedValue(tutorCoursesResponse);
    fetchAllReportEnrollmentsMock.mockResolvedValue(enrollmentsResponse);
    fetchAllReportActivityDetailsMock.mockResolvedValue(activitiesResponse);
    fetchAllReportActivityGradesMock.mockResolvedValue(activitiesResponse);
    fetchAllReportCourseTotalsMock.mockResolvedValue(courseTotalsResponse);
  });

  const generateReport = async (options?: {
    includeSuspendedStudents?: boolean;
    reportType?: "notas" | "pendencias";
  }) => {
    const user = userEvent.setup();
    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getAllByRole("combobox")).toHaveLength(2);
    });

    if (options?.reportType === "pendencias") {
      await user.click(screen.getAllByRole("combobox")[0]);
      await user.click(await screen.findByRole("option", { name: /atividades pendentes/i }));
    }

    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(await screen.findByRole("option", { name: "Turma A" }));
    await user.click(await screen.findByText("Matematica (MAT)"));

    if (options?.includeSuspendedStudents === false) {
      await user.click(screen.getByRole("switch", { name: /incluir alunos suspensos/i }));
    }

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /gerar excel/i })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: /gerar excel/i }));

    await waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1);
    });
  };

  it("includes suspended students in the export by default", async () => {
    await generateReport();

    expect(jsonToSheetMock).toHaveBeenCalledWith([
      {
        Aluno: "Ana Silva",
        "Último Acesso (dias)": 1,
        Matematica: 18,
      },
      {
        Aluno: "Carla Dias",
        "Último Acesso (dias)": 5,
        Matematica: 11,
      },
      {
        Aluno: "Diego Lima",
        "Último Acesso (dias)": 9,
        Matematica: 7,
      },
      {
        Aluno: "Bruno Souza (Suspenso)",
        "Último Acesso (dias)": 12,
        Matematica: 16,
      },
    ]);
    expect(toastSuccessMock).toHaveBeenCalledWith("Relatório gerado com sucesso");
  });

  it("excludes suspended students when the toggle is disabled", async () => {
    await generateReport({ includeSuspendedStudents: false });

    expect(jsonToSheetMock).toHaveBeenCalledWith([
      {
        Aluno: "Ana Silva",
        "Último Acesso (dias)": 1,
        Matematica: 18,
      },
      {
        Aluno: "Carla Dias",
        "Último Acesso (dias)": 5,
        Matematica: 11,
      },
      {
        Aluno: "Diego Lima",
        "Último Acesso (dias)": 9,
        Matematica: 7,
      },
    ]);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("applies grade colors only to non-suspended students in the notes report", async () => {
    await generateReport();

    const notesWorksheet = bookAppendSheetMock.mock.calls.find(([, , sheetName]) => sheetName === "Relatorio de Notas")?.[1];

    expect(notesWorksheet?.C2?.s?.fill?.fgColor?.rgb).toBe("FFC6EFCE");
    expect(notesWorksheet?.C2?.s?.font?.color?.rgb).toBe("FF006100");

    expect(notesWorksheet?.C3?.s?.fill?.fgColor?.rgb).toBe("FFFFEB9C");
    expect(notesWorksheet?.C3?.s?.font?.color?.rgb).toBe("FF9C6500");

    expect(notesWorksheet?.C4?.s?.fill?.fgColor?.rgb).toBe("FFFFC7CE");
    expect(notesWorksheet?.C4?.s?.font?.color?.rgb).toBe("FF9C0006");

    expect(notesWorksheet?.C5?.s?.fill?.fgColor?.rgb).toBe("FFE0E0E0");
    expect(notesWorksheet?.C5?.s?.font?.color?.rgb).toBe("FF999999");
  });

  it("applies last access colors based on days without access", async () => {
    await generateReport();

    const notesWorksheet = bookAppendSheetMock.mock.calls.find(([, , sheetName]) => sheetName === "Relatorio de Notas")?.[1];

    expect(notesWorksheet?.B2?.s?.fill?.fgColor?.rgb).toBe("FFC6EFCE");
    expect(notesWorksheet?.B2?.s?.font?.color?.rgb).toBe("FF006100");

    expect(notesWorksheet?.B3?.s?.fill?.fgColor?.rgb).toBe("FFFFEB9C");
    expect(notesWorksheet?.B3?.s?.font?.color?.rgb).toBe("FF9C6500");

    expect(notesWorksheet?.B4?.s?.fill?.fgColor?.rgb).toBe("FFFFC7CE");
    expect(notesWorksheet?.B4?.s?.font?.color?.rgb).toBe("FF9C0006");

    expect(notesWorksheet?.B5?.s?.fill?.fgColor?.rgb).toBe("FFE0E0E0");
    expect(notesWorksheet?.B5?.s?.font?.color?.rgb).toBe("FF999999");
  });

  it("only includes evaluative pending activities with positive gradebook weight evidence", async () => {
    await generateReport({ reportType: "pendencias" });

    expect(jsonToSheetMock).toHaveBeenNthCalledWith(1, [
      {
        Aluno: "Ana Silva",
        "Último Acesso (dias)": 1,
        "Atividades Pendentes": 1,
        "Pendente de Envio": 1,
        "Pendente de Correção": 0,
      },
      {
        Aluno: "Carla Dias",
        "Último Acesso (dias)": 5,
        "Atividades Pendentes": 1,
        "Pendente de Envio": 0,
        "Pendente de Correção": 1,
      },
    ]);

    expect(jsonToSheetMock).toHaveBeenNthCalledWith(2, [
      {
        Aluno: "Ana Silva",
        "Último Acesso (dias)": 1,
        "Unidade Curricular": "Matematica",
        Atividade: "Trabalho Final",
        Tipo: "assign",
        Status: "Pendente de Envio",
      },
      {
        Aluno: "Carla Dias",
        "Último Acesso (dias)": 5,
        "Unidade Curricular": "Matematica",
        Atividade: "Projeto Aplicado",
        Tipo: "assign",
        Status: "Pendente de Correção",
      },
    ]);

    expect(toastSuccessMock).toHaveBeenCalledWith("Relatório de pendências gerado com sucesso");
    expect(toastInfoMock).not.toHaveBeenCalled();
  });
});
