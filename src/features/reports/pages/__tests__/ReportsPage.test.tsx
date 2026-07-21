import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportsPage from "@/features/reports/pages/ReportsPage";

const listAcademicReportCoursesMock = vi.fn();
const getAcademicGradesReportMock = vi.fn();
const getAcademicPendingActivitiesReportMock = vi.fn();
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

vi.mock("@/features/reports/api", () => ({
  listAcademicReportCourses: (...args: unknown[]) => listAcademicReportCoursesMock(...args),
  getAcademicGradesReport: (...args: unknown[]) => getAcademicGradesReportMock(...args),
  getAcademicPendingActivitiesReport: (...args: unknown[]) => getAcademicPendingActivitiesReportMock(...args),
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
    name: "Matematica (1003121 - Matematica)",
    shortName: "MAT",
    category: "Turma A",
    startsAt: "2020-01-10T00:00:00.000Z",
    endsAt: "2099-12-10T00:00:00.000Z",
    effectiveEndsAt: "2099-12-10T00:00:00.000Z",
    lifecycleStatus: "em_andamento",
  },
];

const gradeStudentsResponse = [
  {
    studentId: "student-1",
    name: "Ana Silva",
    lastAccessAt: daysAgoIso(1),
    isSuspended: false,
    grades: [{ courseId: "course-1", gradeRaw: 18, gradePercentage: 90 }],
  },
  {
    studentId: "student-2",
    name: "Carla Dias",
    lastAccessAt: daysAgoIso(5),
    isSuspended: false,
    grades: [{ courseId: "course-1", gradeRaw: 11, gradePercentage: 55 }],
  },
  {
    studentId: "student-3",
    name: "Diego Lima",
    lastAccessAt: daysAgoIso(9),
    isSuspended: false,
    grades: [{ courseId: "course-1", gradeRaw: 7, gradePercentage: 35 }],
  },
  {
    studentId: "student-4",
    name: "Bruno Souza",
    lastAccessAt: daysAgoIso(12),
    isSuspended: true,
    grades: [{ courseId: "course-1", gradeRaw: 16, gradePercentage: 80 }],
  },
];

const reportMetadata = {
  contractVersion: 1,
  generatedAt: "2026-07-21T12:00:00.000Z",
};

const pendingReportResponse = {
  details: [
    {
      studentId: "student-1",
      courseId: "course-1",
      unitName: "Matematica (1003121 - Matematica)",
      activityName: "Trabalho Final",
      activityType: "assign",
      workflowStatus: "pendingSubmission",
    },
    {
      studentId: "student-2",
      courseId: "course-1",
      unitName: "Matematica (1003121 - Matematica)",
      activityName: "Projeto Aplicado",
      activityType: "assign",
      workflowStatus: "pendingCorrection",
    },
  ],
  metadata: reportMetadata,
  students: [
    {
      studentId: "student-1",
      name: "Ana Silva",
      lastAccessAt: daysAgoIso(1),
      totalCount: 1,
      pendingSubmissionCount: 1,
      pendingCorrectionCount: 0,
    },
    {
      studentId: "student-2",
      name: "Carla Dias",
      lastAccessAt: daysAgoIso(5),
      totalCount: 1,
      pendingSubmissionCount: 0,
      pendingCorrectionCount: 1,
    },
  ],
};

describe("Reports page", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    jsonToSheetMock.mockImplementation((rows: Array<Record<string, unknown>>) => buildWorksheet(rows));
    decodeRangeMock.mockImplementation((worksheetRange: string) => decodeWorksheetRange(worksheetRange));
    encodeCellMock.mockImplementation((cell: { r: number; c: number }) => encodeCellAddress(cell));
    bookNewMock.mockReturnValue({});

    listAcademicReportCoursesMock.mockResolvedValue(tutorCoursesResponse);
    getAcademicGradesReportMock.mockImplementation(
      (_courseIds: string[], includeSuspendedStudents: boolean) => Promise.resolve({
        metadata: reportMetadata,
        students: includeSuspendedStudents
          ? gradeStudentsResponse
          : gradeStudentsResponse.filter(student => !student.isSuspended),
        units: tutorCoursesResponse,
      }),
    );
    getAcademicPendingActivitiesReportMock.mockResolvedValue(pendingReportResponse);
  });

  const generateReport = async (options?: {
    includeSuspendedStudents?: boolean;
    reportType?: "notas" | "pendencias";
    courseGroup?: string;
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
    await user.click(await screen.findByRole("option", { name: options?.courseGroup ?? "Turma A" }));
    await user.click(await screen.findByText("Matematica"));

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

  it("keeps the exported report filename short for long course names", async () => {
    const longCourseGroup = "Senai Escola SENAI Catalao Tecnico em Internet Das Coisas - Iot - Itinerario V - Ensino Medio 1060181 - Tecnico em Internet Das Coisas - Iot - Itinerario V - Ensino Medio - 000022026";
    listAcademicReportCoursesMock.mockResolvedValueOnce([
      {
        ...tutorCoursesResponse[0],
        category: longCourseGroup,
      },
    ]);

    await generateReport({ courseGroup: longCourseGroup });

    const exportedFileName = writeFileMock.mock.calls[0]?.[1];
    expect(exportedFileName).toMatch(/^relatorio_notas_/);
    expect(exportedFileName).toMatch(/_\d{8}\.xlsx$/);
    expect(String(exportedFileName).length).toBeLessThanOrEqual(80);
    expect(exportedFileName).not.toContain("000022026");
  });

  it("uses the class name from the course hierarchy in the exported filename", async () => {
    const courseGroup = "SENAI > Curso Tecnico > Internet das Coisas > Turma A";
    listAcademicReportCoursesMock.mockResolvedValueOnce([
      {
        ...tutorCoursesResponse[0],
        category: courseGroup,
      },
    ]);

    await generateReport({ courseGroup });

    const exportedFileName = writeFileMock.mock.calls[0]?.[1];
    expect(exportedFileName).toMatch(/^relatorio_notas_Turma_A_\d{8}\.xlsx$/);
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
