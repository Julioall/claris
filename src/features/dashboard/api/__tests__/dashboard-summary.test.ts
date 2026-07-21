import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardSummaryDto } from '../contracts/dashboard-summary.contract';

const invokeEdgeFunctionMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    readonly code: string;

    constructor(error: { code: string; message: string }) {
      super(error.message);
      this.code = error.code;
    }
  },
  invokeEdgeFunction: invokeEdgeFunctionMock,
}));

import { getDashboardSummary } from '../dashboard-summary';

const response = {
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
  metadata: {
    appliedCourseCount: 0,
    contractVersion: 1,
    courseId: null,
    dataUpdatedAt: null,
    generatedAt: '2026-07-21T12:00:00.000Z',
    timeZone: 'America/Sao_Paulo',
    week: 'current',
    weekEndsAt: '2026-07-27T03:00:00.000Z',
    weekStartsAt: '2026-07-20T03:00:00.000Z',
  },
} satisfies DashboardSummaryDto;

describe('getDashboardSummary', () => {
  beforeEach(() => {
    invokeEdgeFunctionMock.mockReset();
    invokeEdgeFunctionMock.mockResolvedValue(response);
  });

  it('invokes the authenticated V1 endpoint with cancellation and timeout', async () => {
    const controller = new AbortController();

    await expect(getDashboardSummary({
      courseId: '0f6a3b55-7a9d-4a22-a10d-567890abcdef',
      week: 'last',
    }, controller.signal)).resolves.toBe(response);

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('dashboard-summary', {
      auth: 'required',
      body: {
        action: 'get_summary',
        courseId: '0f6a3b55-7a9d-4a22-a10d-567890abcdef',
        week: 'last',
      },
      signal: controller.signal,
      timeoutMs: 20_000,
    });
  });

  it('omits courseId instead of sending an all-courses sentinel', async () => {
    await getDashboardSummary({ week: 'current' });

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('dashboard-summary', {
      auth: 'required',
      body: {
        action: 'get_summary',
        week: 'current',
      },
      signal: undefined,
      timeoutMs: 20_000,
    });
    expect(invokeEdgeFunctionMock.mock.calls[0][1].body).not.toHaveProperty('userId');
  });

  it('rejects a response that does not match the dashboard contract', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      ...response,
      indicators: { ...response.indicators, todayEvents: 'zero' },
    });

    await expect(getDashboardSummary({ week: 'current' })).rejects.toMatchObject({
      code: 'invalid_response',
      message: 'A API retornou um dashboard invalido.',
    });
  });
});
