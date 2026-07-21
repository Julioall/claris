import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoursePanelDto } from '@/features/courses/api/contracts/course-panel.contract';
import { useCoursePanel } from '@/features/courses/hooks/useCoursePanel';
import { courseKeys } from '@/features/courses/query-keys';
import { createQueryClientWrapper } from '@/test/query-client';

const useAuthMock = vi.fn();
const getCoursePanelMock = vi.fn();
const setCourseActivityVisibilityMock = vi.fn();
const setCourseAttendanceEnabledMock = vi.fn();
const toastMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/features/courses/api/course-panel', () => ({
  getCoursePanel: (...args: unknown[]) => getCoursePanelMock(...args),
  setCourseActivityVisibility: (...args: unknown[]) => setCourseActivityVisibilityMock(...args),
}));

vi.mock('@/features/courses/api/courses-catalog', () => ({
  setCourseAttendanceEnabled: (...args: unknown[]) => setCourseAttendanceEnabledMock(...args),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

const panelData: CoursePanelDto = {
  activities: [{
    courseId: 'c-1',
    dueAt: '2026-02-21T00:00:00.000Z',
    hidden: false,
    id: 'a-1',
    isAssignment: true,
    moodleActivityId: 'm-1',
    name: 'Atividade 1',
    submissionCounts: {
      completed: 0,
      corrected: 1,
      pendingCorrection: 0,
      pendingSubmission: 0,
      total: 1,
    },
    submissions: [{
      completedAt: '2026-02-20T00:00:00.000Z',
      grade: 8,
      gradedAt: '2026-02-20T00:00:00.000Z',
      gradeMax: 10,
      id: 'a-1',
      percentage: 80,
      studentId: 's-1',
      submittedAt: '2026-02-19T00:00:00.000Z',
      workflowStatus: 'corrected',
    }],
    type: 'assignment',
  }],
  attendanceEnabled: false,
  course: {
    category: 'Senai > Escola A > Curso X > Turma 1',
    effectiveEndsAt: '2026-12-31T00:00:00.000Z',
    endsAt: '2026-12-31T00:00:00.000Z',
    id: 'c-1',
    lastSyncedAt: '2026-02-20T00:00:00.000Z',
    lifecycle: 'inProgress',
    moodleCourseId: '10',
    name: 'Matematica',
    shortName: 'MAT',
    startsAt: '2026-01-01T00:00:00.000Z',
  },
  metadata: {
    contractVersion: 1,
    dataUpdatedAt: '2026-02-20T00:00:00.000Z',
    generatedAt: '2026-02-21T00:00:00.000Z',
  },
  stats: {
    totalStudents: 2,
    atRiskStudents: 1,
    totalActivities: 1,
    completionRate: 100,
    riskDistribution: {
      normal: 1,
      atencao: 0,
      risco: 1,
      critico: 0,
    },
  },
  students: [{
    avatarUrl: null,
    email: 'ana@example.com',
    enrollmentStatus: 'ativo',
    id: 's-1',
    lastAccessAt: '2026-02-20T00:00:00.000Z',
    name: 'Ana',
    riskLevel: 'risco',
  }],
};

describe('useCoursePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: 'user-1' } });
    getCoursePanelMock.mockResolvedValue(panelData);
    setCourseActivityVisibilityMock.mockResolvedValue({ updatedCount: 1 });
    setCourseAttendanceEnabledMock.mockResolvedValue({ affectedCourseCount: 1 });
  });

  it('loads the complete panel with one user-scoped request', async () => {
    const { wrapper, queryClient } = createQueryClientWrapper();
    const { result } = renderHook(() => useCoursePanel('c-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getCoursePanelMock).toHaveBeenCalledTimes(1);
    expect(getCoursePanelMock).toHaveBeenCalledWith('c-1', expect.any(AbortSignal));
    expect(result.current.course).toMatchObject({ id: 'c-1', shortName: 'MAT' });
    expect(result.current.activities[0]).toMatchObject({
      moodleActivityId: 'm-1',
      submissionCounts: { corrected: 1 },
    });
    expect(result.current.isAttendanceEnabled).toBe(false);
    expect(queryClient.getQueryData(courseKeys.panel('user-1', 'c-1'))).toBe(panelData);
  });

  it('does not request a panel without authenticated identity', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCoursePanel('c-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getCoursePanelMock).not.toHaveBeenCalled();
  });

  it('returns a validation error when course id is not provided', () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCoursePanel(undefined), { wrapper });

    expect(result.current.error).toContain('não fornecido');
    expect(getCoursePanelMock).not.toHaveBeenCalled();
  });

  it('exposes transport failures', async () => {
    getCoursePanelMock.mockRejectedValueOnce(new Error('course failed'));
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCoursePanel('c-1'), { wrapper });

    await waitFor(() => expect(result.current.error).toContain('course failed'));
  });

  it('sends a visibility intent and emits the success toast', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCoursePanel('c-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggleActivityVisibility('m-1', true);
    });

    expect(setCourseActivityVisibilityMock).toHaveBeenCalledWith('c-1', 'm-1', true);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringMatching(/oculta/i),
    }));
  });

  it('shows a destructive toast when visibility update fails', async () => {
    setCourseActivityVisibilityMock.mockRejectedValueOnce(new Error('update failed'));
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCoursePanel('c-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.toggleActivityVisibility('m-1', false)).rejects.toThrow('update failed');
    });

    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Erro',
      variant: 'destructive',
    }));
  });

  it('toggles attendance through one desired-state command and updates panel cache', async () => {
    const { wrapper, queryClient } = createQueryClientWrapper();
    const { result } = renderHook(() => useCoursePanel('c-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggleAttendance();
    });

    expect(setCourseAttendanceEnabledMock).toHaveBeenCalledWith(['c-1'], true);
    await waitFor(() => expect(result.current.isAttendanceEnabled).toBe(true));
    expect(queryClient.getQueryData(courseKeys.catalog('user-1'))).toBeUndefined();

    await act(async () => {
      await result.current.toggleAttendance();
    });

    expect(setCourseAttendanceEnabledMock).toHaveBeenLastCalledWith(['c-1'], false);
    await waitFor(() => expect(result.current.isAttendanceEnabled).toBe(false));
  });
});
