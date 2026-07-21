import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CourseAttendanceTab } from '@/components/attendance/CourseAttendanceTab';

const getOverviewMock = vi.fn();
const getSheetMock = vi.fn();
const saveAttendanceMock = vi.fn();
const toastMock = vi.fn();

vi.mock('@/features/courses/api/course-attendance', () => ({
  getCourseAttendanceOverview: (...args: unknown[]) => getOverviewMock(...args),
  getCourseAttendanceSheet: (...args: unknown[]) => getSheetMock(...args),
  saveCourseAttendance: (...args: unknown[]) => saveAttendanceMock(...args),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

const emptyOverview = {
  dateSummaries: [],
  metadata: {
    contractVersion: 1,
    generatedAt: '2026-07-21T15:00:00.000Z',
    hasMore: false,
    limit: 120,
    offset: 0,
  },
  records: [],
  students: [],
};

describe('CourseAttendanceTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOverviewMock.mockResolvedValue(emptyOverview);
    getSheetMock.mockImplementation(async (courseId: string, date: string) => ({
      courseId,
      date,
      entries: [],
      metadata: { contractVersion: 1, generatedAt: '2026-07-21T15:00:00.000Z' },
    }));
    saveAttendanceMock.mockResolvedValue({
      courseId: 'c-1',
      date: '2026-02-23',
      savedCount: 1,
      metadata: { contractVersion: 1, generatedAt: '2026-07-21T15:00:00.000Z' },
    });
  });

  it('renders grouped attendance stats and latest details without Teams actions', async () => {
    getOverviewMock.mockResolvedValueOnce({
      ...emptyOverview,
      dateSummaries: [{
        date: '2026-02-23',
        presente: 200,
        ausente: 99,
        justificado: 1,
        total: 300,
      }],
      records: [
        {
          id: 'r-1',
          date: '2026-02-23',
          status: 'presente',
          notes: 'Participativo',
          student: { id: 's-1', name: 'Ana Silva' },
          updatedAt: '2026-02-23T14:00:00.000Z',
        },
        {
          id: 'r-2',
          date: '2026-02-23',
          status: 'ausente',
          notes: null,
          student: { id: 's-2', name: 'Bruno Lima' },
          updatedAt: '2026-02-23T14:00:00.000Z',
        },
      ],
      students: [
        { id: 's-1', name: 'Ana Silva', email: 'ana@example.com' },
        { id: 's-2', name: 'Bruno Lima', email: 'bruno@example.com' },
      ],
    });

    render(<CourseAttendanceTab canManage courseId="c-1" />);

    await waitFor(() => {
      expect(screen.getByText(/registros de presença/i)).toBeInTheDocument();
    });

    expect(getOverviewMock).toHaveBeenCalledWith('c-1', expect.any(AbortSignal));
    expect(screen.getAllByText(/23\/02\/2026/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/300 registro/i)).toBeInTheDocument();
    expect(screen.getByText(/Presente:\s*200/i)).toBeInTheDocument();
    expect(screen.getByText(/Ausente:\s*99/i)).toBeInTheDocument();
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Bruno Lima')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /importar do teams/i })).not.toBeInTheDocument();
  });

  it('shows warning toast when trying to save without selecting any status', async () => {
    const user = userEvent.setup();
    getOverviewMock.mockResolvedValueOnce({
      ...emptyOverview,
      students: [{ id: 's-1', name: 'Ana Silva', email: null }],
    });

    render(<CourseAttendanceTab canManage courseId="c-1" />);

    await user.click(await screen.findByRole('button', { name: /nova presença/i }));
    const saveButton = screen.getByRole('button', { name: /^salvar$/i });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    expect(saveAttendanceMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/nenhum registro para salvar/i) }),
    );
  });

  it('loads the selected date and saves attendance through the use-case client', async () => {
    const user = userEvent.setup();
    getOverviewMock
      .mockResolvedValueOnce({
        ...emptyOverview,
        students: [{ id: 's-1', name: 'Ana Silva', email: null }],
      })
      .mockResolvedValueOnce({
        ...emptyOverview,
        records: [{
          id: 'r-1',
          date: '2026-02-23',
          status: 'presente',
          notes: 'Chegou no horario',
          student: { id: 's-1', name: 'Ana Silva' },
          updatedAt: '2026-02-23T14:00:00.000Z',
        }],
        students: [{ id: 's-1', name: 'Ana Silva', email: null }],
      });

    render(<CourseAttendanceTab canManage courseId="c-1" />);

    await user.click(await screen.findByRole('button', { name: /nova presença/i }));
    await waitFor(() => expect(getSheetMock).toHaveBeenCalledWith(
      'c-1',
      expect.any(String),
      expect.any(AbortSignal),
    ));

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /^Presente$/i }));
    await user.type(screen.getByPlaceholderText(/observação \(opcional\)/i), 'Chegou no horario');
    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(saveAttendanceMock).toHaveBeenCalledTimes(1));
    expect(saveAttendanceMock).toHaveBeenCalledWith({
      courseId: 'c-1',
      date: expect.any(String),
      entries: [{
        studentId: 's-1',
        status: 'presente',
        notes: 'Chegou no horario',
      }],
    });
    expect(getOverviewMock).toHaveBeenCalledTimes(2);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/presenças salvas/i) }),
    );
  });

  it('ignores a stale sheet response and blocks saving until the selected date is loaded', async () => {
    const user = userEvent.setup();
    const pending = new Map<string, (value: unknown) => void>();
    getOverviewMock.mockResolvedValueOnce({
      ...emptyOverview,
      students: [{ id: 's-1', name: 'Ana Silva', email: null }],
    });
    getSheetMock.mockImplementation((_courseId: string, date: string) => (
      new Promise((resolve) => pending.set(date, resolve))
    ));

    render(<CourseAttendanceTab canManage courseId="c-1" />);

    await user.click(await screen.findByRole('button', { name: /nova presença/i }));
    await waitFor(() => expect(getSheetMock).toHaveBeenCalledTimes(1));
    const initialDate = getSheetMock.mock.calls[0][1] as string;
    const initialSignal = getSheetMock.mock.calls[0][2] as AbortSignal;
    const dateInput = screen.getByLabelText(/data da chamada/i);
    const nextDate = initialDate === '2026-02-23' ? '2026-02-24' : '2026-02-23';

    fireEvent.change(dateInput, { target: { value: nextDate } });

    await waitFor(() => expect(getSheetMock).toHaveBeenCalledTimes(2));
    expect(initialSignal.aborted).toBe(true);
    expect(screen.getByRole('button', { name: /^salvar$/i })).toBeDisabled();

    pending.get(nextDate)?.({
      courseId: 'c-1',
      date: nextDate,
      entries: [{ studentId: 's-1', status: 'ausente', notes: null, updatedAt: null }],
      metadata: { contractVersion: 1, generatedAt: '2026-07-21T15:00:00.000Z' },
    });
    pending.get(initialDate)?.({
      courseId: 'c-1',
      date: initialDate,
      entries: [{ studentId: 's-1', status: 'presente', notes: null, updatedAt: null }],
      metadata: { contractVersion: 1, generatedAt: '2026-07-21T15:00:00.000Z' },
    });

    const saveButton = screen.getByRole('button', { name: /^salvar$/i });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(saveAttendanceMock).toHaveBeenCalledWith({
      courseId: 'c-1',
      date: nextDate,
      entries: [{ studentId: 's-1', status: 'ausente', notes: null }],
    }));
  });
});
