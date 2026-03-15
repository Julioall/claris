import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Reports from '@/pages/Reports';

const useAuthMock = vi.fn();
const fromMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const jsonToSheetMock = vi.fn();
const decodeRangeMock = vi.fn();
const encodeCellMock = vi.fn();
const bookNewMock = vi.fn();
const bookAppendSheetMock = vi.fn();
const writeFileMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock('xlsx-js-style', () => ({
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
    course_id: 'course-1',
    courses: {
      id: 'course-1',
      name: 'Matematica',
      short_name: 'MAT',
      category: 'Turma A',
      start_date: '2026-01-10T00:00:00.000Z',
      end_date: '2026-12-10T00:00:00.000Z',
    },
  },
];

const enrollmentsResponse = [
  {
    student_id: 'student-1',
    course_id: 'course-1',
    enrollment_status: 'ativo',
    students: { full_name: 'Ana Silva' },
  },
  {
    student_id: 'student-2',
    course_id: 'course-1',
    enrollment_status: 'suspenso',
    students: { full_name: 'Bruno Souza' },
  },
];

const activitiesResponse = [
  {
    student_id: 'student-1',
    course_id: 'course-1',
    grade: 70,
    grade_max: 100,
    hidden: false,
    status: 'graded',
    graded_at: '2026-03-10T12:00:00.000Z',
    submitted_at: '2026-03-09T12:00:00.000Z',
  },
  {
    student_id: 'student-2',
    course_id: 'course-1',
    grade: null,
    grade_max: 100,
    hidden: false,
    status: 'submitted',
    graded_at: null,
    submitted_at: '2026-03-11T09:00:00.000Z',
  },
];

const courseTotalsResponse = [
  {
    student_id: 'student-1',
    course_id: 'course-1',
    grade_raw: 18,
    grade_percentage: 90,
  },
  {
    student_id: 'student-2',
    course_id: 'course-1',
    grade_raw: null,
    grade_percentage: null,
  },
];

describe('Reports page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: 'user-1' } });

    jsonToSheetMock.mockImplementation(() => ({
      '!ref': 'A1',
      A1: { v: 'Aluno' },
    }));
    decodeRangeMock.mockReturnValue({
      s: { r: 0, c: 0 },
      e: { r: 0, c: 0 },
    });
    encodeCellMock.mockReturnValue('A1');
    bookNewMock.mockReturnValue({});

    fromMock.mockImplementation((table: string) => {
      if (table === 'user_courses') {
        return {
          select: () => ({
            eq: () => ({
              eq: vi.fn().mockResolvedValue({ data: tutorCoursesResponse, error: null }),
            }),
          }),
        };
      }

      if (table === 'student_courses') {
        return {
          select: () => ({
            in: () => ({
              range: vi.fn().mockResolvedValue({ data: enrollmentsResponse, error: null }),
            }),
          }),
        };
      }

      if (table === 'student_activities') {
        return {
          select: () => ({
            in: () => ({
              neq: () => ({
                range: vi.fn().mockResolvedValue({ data: activitiesResponse, error: null }),
              }),
            }),
          }),
        };
      }

      if (table === 'student_course_grades') {
        return {
          select: () => ({
            in: () => ({
              range: vi.fn().mockResolvedValue({ data: courseTotalsResponse, error: null }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });
  });

  const generateReport = async (options?: { includeSuspendedStudents?: boolean }) => {
    const user = userEvent.setup();
    render(<Reports />);

    await waitFor(() => {
      expect(screen.getAllByRole('combobox')).toHaveLength(2);
    });

    await user.click(screen.getAllByRole('combobox')[1]);
    await user.click(await screen.findByRole('option', { name: 'Turma A' }));

    await user.click(await screen.findByText('Matematica (MAT)'));

    if (options?.includeSuspendedStudents === false) {
      await user.click(screen.getByRole('switch', { name: /incluir alunos suspensos/i }));
    }

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /gerar excel/i })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: /gerar excel/i }));

    await waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1);
    });
  };

  it('includes suspended students in the export by default', async () => {
    await generateReport();

    expect(jsonToSheetMock).toHaveBeenCalledWith([
      {
        Aluno: 'Ana Silva',
        Matematica: 18,
      },
      {
        Aluno: 'Bruno Souza (Suspenso)',
        Matematica: '',
      },
    ]);
    expect(toastSuccessMock).toHaveBeenCalledWith('Relatório gerado com sucesso');
  });

  it('excludes suspended students when the toggle is disabled', async () => {
    await generateReport({ includeSuspendedStudents: false });

    expect(jsonToSheetMock).toHaveBeenCalledWith([
      {
        Aluno: 'Ana Silva',
        Matematica: 18,
      },
    ]);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
