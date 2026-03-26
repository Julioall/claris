import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCoursePanel } from '@/features/courses/hooks/useCoursePanel';
import { createQueryClientWrapper } from '@/test/query-client';

const useAuthMock = vi.fn();
const getCoursePanelMock = vi.fn();
const getCourseAttendanceEnabledMock = vi.fn();
const setCourseActivityVisibilityMock = vi.fn();
const enableAttendanceForCoursesMock = vi.fn();
const disableAttendanceForCoursesMock = vi.fn();
const toastMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/features/courses/api/courses.repository', () => ({
  getCoursePanel: (...args: unknown[]) => getCoursePanelMock(...args),
  getCourseAttendanceEnabled: (...args: unknown[]) => getCourseAttendanceEnabledMock(...args),
  setCourseActivityVisibility: (...args: unknown[]) => setCourseActivityVisibilityMock(...args),
  enableAttendanceForCourses: (...args: unknown[]) => enableAttendanceForCoursesMock(...args),
  disableAttendanceForCourses: (...args: unknown[]) => disableAttendanceForCoursesMock(...args),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

const panelData = {
  course: {
    id: 'c-1',
    name: 'Matematica',
    short_name: 'MAT',
    moodle_course_id: '10',
    category: 'Senai > Escola A > Curso X > Turma 1',
    start_date: '2026-01-01T00:00:00.000Z',
    end_date: '2026-12-31T00:00:00.000Z',
    effective_end_date: '2026-12-31T00:00:00.000Z',
  },
  students: [
    {
      id: 's-1',
      moodle_user_id: '11',
      full_name: 'Ana',
      current_risk_level: 'risco',
      created_at: '2026-02-01T00:00:00.000Z',
      updated_at: '2026-02-01T00:00:00.000Z',
      last_access: '2026-02-20T00:00:00.000Z',
    },
    {
      id: 's-2',
      moodle_user_id: '12',
      full_name: 'Bruno',
      current_risk_level: 'normal',
      created_at: '2026-02-01T00:00:00.000Z',
      updated_at: '2026-02-01T00:00:00.000Z',
      last_access: null,
    },
  ],
  activities: [
    {
      id: 'a-1',
      student_id: 's-1',
      course_id: 'c-1',
      moodle_activity_id: 'm-1',
      activity_name: 'Atividade 1',
      activity_type: 'quiz',
      grade: 8,
      grade_max: 10,
      percentage: 80,
      status: 'completed',
      completed_at: '2026-02-20T00:00:00.000Z',
      due_date: '2026-02-21T00:00:00.000Z',
      hidden: false,
    },
    {
      id: 'a-4',
      student_id: 's-2',
      course_id: 'c-1',
      moodle_activity_id: 'm-3',
      activity_name: 'Atividade 3',
      activity_type: 'assignment',
      grade: 7,
      grade_max: 10,
      percentage: 70,
      status: 'completed',
      completed_at: '2026-02-20T00:00:00.000Z',
      due_date: '2026-02-21T00:00:00.000Z',
      hidden: false,
    },
  ],
  activitySubmissions: [
    {
      id: 'a-1',
      student_id: 's-1',
      course_id: 'c-1',
      moodle_activity_id: 'm-1',
      activity_name: 'Atividade 1',
      activity_type: 'quiz',
      grade: 8,
      grade_max: 10,
      percentage: 80,
      status: 'completed',
      completed_at: '2026-02-20T00:00:00.000Z',
      due_date: '2026-02-21T00:00:00.000Z',
      hidden: false,
    },
  ],
  stats: {
    totalStudents: 2,
    atRiskStudents: 1,
    totalActivities: 2,
    completionRate: 100,
    riskDistribution: {
      normal: 1,
      atencao: 0,
      risco: 1,
      critico: 0,
    },
  },
};

describe('useCoursePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: 'user-1' } });
    getCoursePanelMock.mockResolvedValue(panelData);
    getCourseAttendanceEnabledMock.mockResolvedValue(false);
    setCourseActivityVisibilityMock.mockResolvedValue(undefined);
    enableAttendanceForCoursesMock.mockResolvedValue(undefined);
    disableAttendanceForCoursesMock.mockResolvedValue(undefined);
  });

  it('loads course, students, activities, stats and attendance flag', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCoursePanel('c-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.course).toMatchObject({ id: 'c-1', short_name: 'MAT' });
    expect(result.current.students).toHaveLength(2);
    expect(result.current.activities).toHaveLength(2);
    expect(result.current.stats).toEqual(panelData.stats);
    await waitFor(() => {
      expect(result.current.isAttendanceEnabled).toBe(false);
    });
  });

  it('returns validation error when course id is not provided', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCoursePanel(undefined), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toContain('não fornecido');
    expect(getCoursePanelMock).not.toHaveBeenCalled();
  });

  it('handles fetch failures', async () => {
    getCoursePanelMock.mockRejectedValueOnce(new Error('course failed'));

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCoursePanel('c-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toContain('course failed');
    });
  });

  it('toggles activity visibility and emits success toast', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCoursePanel('c-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggleActivityVisibility('m-1', true);
    });

    expect(setCourseActivityVisibilityMock).toHaveBeenCalledWith('c-1', 'm-1', true);
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/oculta/i),
        }),
      );
    });
  });

  it('shows destructive toast when visibility update fails', async () => {
    setCourseActivityVisibilityMock.mockRejectedValueOnce(new Error('update failed'));

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCoursePanel('c-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await expect(result.current.toggleActivityVisibility('m-1', false)).rejects.toThrow('update failed');
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro',
        variant: 'destructive',
      }),
    );
  });

  it('toggles attendance and updates the cached flag', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCoursePanel('c-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.isAttendanceEnabled).toBe(false);
    });

    await act(async () => {
      await result.current.toggleAttendance();
    });

    expect(enableAttendanceForCoursesMock).toHaveBeenCalledWith('user-1', ['c-1']);
    await waitFor(() => {
      expect(result.current.isAttendanceEnabled).toBe(true);
    });

    await act(async () => {
      await result.current.toggleAttendance();
    });

    expect(disableAttendanceForCoursesMock).toHaveBeenCalledWith('user-1', ['c-1']);
    await waitFor(() => {
      expect(result.current.isAttendanceEnabled).toBe(false);
    });
  });
});
