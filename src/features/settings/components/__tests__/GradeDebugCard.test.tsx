import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GradeDebugCard } from '@/features/settings/components/GradeDebugCard';

const apiMocks = vi.hoisted(() => ({
  debugStudentGrades: vi.fn(),
  listGradeDebugCourses: vi.fn(),
  listGradeDebugStudents: vi.fn(),
}));

vi.mock('@/features/settings/api', () => apiMocks);
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333';
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

async function pickComboboxOption(index: number, optionName: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getAllByRole('combobox')[index]);
  await user.click(await screen.findByRole('option', { name: optionName }));
}

describe('GradeDebugCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.setItem('claris:selected-moodle-connection:user-1', CONNECTION_ID);
    apiMocks.listGradeDebugCourses.mockResolvedValue([
      { id: COURSE_ID, name: 'Matematica' },
    ]);
    apiMocks.listGradeDebugStudents.mockResolvedValue([
      { id: STUDENT_ID, fullName: 'Ana Silva' },
    ]);
    apiMocks.debugStudentGrades.mockResolvedValue({
      contractVersion: 1,
      course: { id: COURSE_ID, name: 'Matematica' },
      courseGrade: null,
      items: [],
      operationId: '33333333-3333-4333-8333-333333333333',
      student: { id: STUDENT_ID, fullName: 'Ana Silva' },
      summary: { returnedItems: 0, totalItems: 0, truncated: false },
    });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it('loads courses from the admin endpoint once while cached', async () => {
    const user = userEvent.setup();
    render(<GradeDebugCard />);

    await user.click(screen.getByText(/Diagnóstico de Notas/i));
    await waitFor(() => expect(apiMocks.listGradeDebugCourses).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText(/Diagnóstico de Notas/i));
    await user.click(screen.getByText(/Diagnóstico de Notas/i));
    expect(apiMocks.listGradeDebugCourses).toHaveBeenCalledTimes(1);
  });

  it('runs the diagnostic using only internal course and student identifiers', async () => {
    const user = userEvent.setup();
    render(<GradeDebugCard />);

    await user.click(screen.getByText(/Diagnóstico de Notas/i));
    await pickComboboxOption(0, /Matematica/i);
    await waitFor(() => {
      expect(apiMocks.listGradeDebugStudents).toHaveBeenCalledWith(CONNECTION_ID, COURSE_ID);
    });
    await pickComboboxOption(1, /Ana Silva/i);
    await user.click(screen.getByRole('button', { name: /Executar diagnóstico/i }));

    await waitFor(() => {
      expect(apiMocks.debugStudentGrades).toHaveBeenCalledWith({
        connectionId: CONNECTION_ID,
        courseId: COURSE_ID,
        studentId: STUDENT_ID,
      });
    });
    expect(screen.getByText(/Resultado normalizado/i)).toBeInTheDocument();
    expect(screen.getByText(/"contractVersion": 1/i)).toBeInTheDocument();
  });

  it('shows an endpoint error', async () => {
    const user = userEvent.setup();
    apiMocks.debugStudentGrades.mockRejectedValue(new Error('Falha no diagnóstico'));
    render(<GradeDebugCard />);

    await user.click(screen.getByText(/Diagnóstico de Notas/i));
    await pickComboboxOption(0, /Matematica/i);
    await pickComboboxOption(1, /Ana Silva/i);
    await user.click(screen.getByRole('button', { name: /Executar diagnóstico/i }));

    expect(await screen.findByText(/Falha no diagnóstico/i)).toBeInTheDocument();
  });
});
