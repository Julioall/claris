import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardSummaryDto } from '@/features/dashboard/api/contracts/dashboard-summary.contract';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';
import { createQueryClientWrapper } from '@/test/query-client';

const useAuthMock = vi.fn();
const getDashboardSummaryMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/features/dashboard/api/dashboard-summary', () => ({
  getDashboardSummary: (...args: unknown[]) => getDashboardSummaryMock(...args),
}));

const dashboardDataResponse: DashboardSummaryDto = {
  indicators: {
    activeNormalStudents: 0,
    activitiesToReview: 12,
    newAtRiskThisWeek: 2,
    pendingCorrectionAssignments: 12,
    pendingSubmissionAssignments: 1,
    studentsAtRisk: 2,
    todayEvents: 2,
    todayTasks: 3,
  },
  criticalStudents: [
    {
      id: 's-2',
      name: 'Bruno',
      riskLevel: 'critico',
      riskReasons: ['baixa_nota'],
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
    {
      id: 's-1',
      name: 'Ana',
      riskLevel: 'risco',
      riskReasons: [],
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
  ],
  activitiesToReview: [
    {
      id: 'act-1',
      name: 'Trabalho final',
      studentId: 's-2',
      courseId: 'c-1',
      dueAt: '2026-03-20T00:00:00.000Z',
      submittedAt: '2026-03-21T00:00:00.000Z',
      student: {
        id: 's-2',
        name: 'Bruno',
        riskLevel: 'critico',
      },
      course: {
        id: 'c-1',
        name: 'Curso 1',
        shortName: 'CUR-1',
      },
    },
    {
      id: 'act-2',
      name: 'Estudo dirigido',
      studentId: 's-1',
      courseId: 'c-1',
      dueAt: '2026-03-22T00:00:00.000Z',
      submittedAt: '2026-03-23T00:00:00.000Z',
      student: {
        id: 's-1',
        name: 'Ana',
        riskLevel: 'risco',
      },
      course: {
        id: 'c-1',
        name: 'Curso 1',
        shortName: 'CUR-1',
      },
    },
  ],
  activityFeed: [
    {
      id: 'f-1',
      eventType: 'task_created',
      title: 'Nova pendencia',
      description: 'Criada agora',
      metadata: { priority: 'alta' },
      occurredAt: '2026-02-21T10:00:00.000Z',
      student: {
        id: 's-1',
        name: 'Ana',
      },
      studentId: 's-1',
    },
  ],
  metadata: {
    appliedCourseCount: 1,
    contractVersion: 1,
    courseId: null,
    dataUpdatedAt: '2026-02-21T09:00:00.000Z',
    generatedAt: '2026-02-21T10:00:00.000Z',
    timeZone: 'America/Sao_Paulo',
    week: 'current',
    weekEndsAt: '2026-02-23T03:00:00.000Z',
    weekStartsAt: '2026-02-16T03:00:00.000Z',
  },
};

function emptyDashboard(): DashboardSummaryDto {
  return {
    ...dashboardDataResponse,
    activitiesToReview: [],
    activityFeed: [],
    criticalStudents: [],
    indicators: {
      activeNormalStudents: 0,
      activitiesToReview: 0,
      newAtRiskThisWeek: 0,
      pendingCorrectionAssignments: 0,
      pendingSubmissionAssignments: 0,
      studentsAtRisk: 0,
      todayEvents: 0,
      todayTasks: 0,
    },
  };
}

describe('useDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: 'user-1' } });
    getDashboardSummaryMock.mockResolvedValue(dashboardDataResponse);
  });

  it('returns early when user is not authenticated', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { wrapper } = createQueryClientWrapper();

    const { result } = renderHook(() => useDashboardData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.summary).toBeNull();
    expect(result.current.metadata).toBeNull();
    expect(getDashboardSummaryMock).not.toHaveBeenCalled();
  });

  it('returns the empty dashboard provided by the endpoint', async () => {
    getDashboardSummaryMock.mockResolvedValueOnce(emptyDashboard());
    const { wrapper } = createQueryClientWrapper();

    const { result } = renderHook(() => useDashboardData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.summary).toEqual(emptyDashboard().indicators);
    expect(result.current.criticalStudents).toEqual([]);
    expect(result.current.activitiesToReview).toEqual([]);
    expect(result.current.activityFeed).toEqual([]);
  });

  it('loads the V1 dashboard without sending the authenticated user id', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useDashboardData('current', 'all'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.summary).toEqual(dashboardDataResponse.indicators);
    expect(getDashboardSummaryMock).toHaveBeenCalledWith(
      { courseId: undefined, week: 'current' },
      expect.any(AbortSignal),
    );
    expect(getDashboardSummaryMock.mock.calls[0][0]).not.toHaveProperty('userId');
    expect(result.current.criticalStudents.map((student) => student.id)).toEqual(['s-2', 's-1']);
    expect(result.current.activitiesToReview[0]).toMatchObject({
      id: 'act-1',
      name: 'Trabalho final',
      student: { id: 's-2', name: 'Bruno' },
      course: { id: 'c-1', shortName: 'CUR-1' },
    });
    expect(result.current.activityFeed[0]).toMatchObject({
      id: 'f-1',
      title: 'Nova pendencia',
      student: { id: 's-1', name: 'Ana' },
    });
    expect(result.current.metadata).toEqual(dashboardDataResponse.metadata);
  });

  it('forwards the selected week and concrete course filter', async () => {
    const { wrapper } = createQueryClientWrapper();

    renderHook(() => useDashboardData('last', '0f6a3b55-7a9d-4a22-a10d-567890abcdef'), { wrapper });

    await waitFor(() => {
      expect(getDashboardSummaryMock).toHaveBeenCalledWith(
        {
          courseId: '0f6a3b55-7a9d-4a22-a10d-567890abcdef',
          week: 'last',
        },
        expect.any(AbortSignal),
      );
    });
  });

  it('keeps the endpoint error message and exposes refetch', async () => {
    getDashboardSummaryMock.mockRejectedValueOnce(new Error('Dashboard indisponivel'));
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useDashboardData(), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toBe('Dashboard indisponivel');
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.refetch).toEqual(expect.any(Function));
  });
});
