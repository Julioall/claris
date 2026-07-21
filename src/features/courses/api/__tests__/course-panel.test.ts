import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import {
  getCoursePanel,
  setCourseActivityVisibility,
} from '../course-panel';

const panelResponse = {
  activities: [{
    courseId: 'course-1',
    dueAt: '2026-08-01T00:00:00.000Z',
    hidden: false,
    id: 'activity-row-1',
    isAssignment: true,
    moodleActivityId: 'activity-1',
    name: 'Trabalho',
    submissionCounts: {
      completed: 0,
      corrected: 0,
      pendingCorrection: 1,
      pendingSubmission: 0,
      total: 1,
    },
    submissions: [{
      completedAt: null,
      grade: null,
      gradedAt: null,
      gradeMax: 10,
      id: 'activity-row-1',
      percentage: null,
      studentId: 'student-1',
      submittedAt: '2026-07-20T00:00:00.000Z',
      workflowStatus: 'pendingCorrection',
    }],
    type: 'assign',
  }],
  attendanceEnabled: true,
  course: {
    category: 'Escola > Curso',
    effectiveEndsAt: '2026-12-31T00:00:00.000Z',
    endsAt: '2026-12-31T00:00:00.000Z',
    id: 'course-1',
    lastSyncedAt: '2026-07-21T12:00:00.000Z',
    lifecycle: 'inProgress',
    moodleCourseId: '101',
    name: 'Matematica',
    shortName: 'MAT',
    startsAt: '2026-01-01T00:00:00.000Z',
  },
  metadata: {
    contractVersion: 1,
    dataUpdatedAt: '2026-07-21T12:00:00.000Z',
    generatedAt: '2026-07-21T13:00:00.000Z',
  },
  stats: {
    atRiskStudents: 1,
    completionRate: 50,
    riskDistribution: { atencao: 0, critico: 0, normal: 0, risco: 1 },
    totalActivities: 1,
    totalStudents: 1,
  },
  students: [{
    avatarUrl: null,
    email: 'ana@example.com',
    enrollmentStatus: 'ativo',
    id: 'student-1',
    lastAccessAt: null,
    name: 'Ana',
    riskLevel: 'risco',
  }],
};

describe('course panel API client', () => {
  beforeEach(() => {
    invokeEdgeFunctionMock.mockReset();
  });

  it('loads one versioned panel without sending browser identity', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce(panelResponse);
    const controller = new AbortController();

    await expect(getCoursePanel('course-1', controller.signal)).resolves.toBe(panelResponse);

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('course-panel', {
      auth: 'required',
      body: { action: 'get_panel', courseId: 'course-1' },
      signal: controller.signal,
      timeoutMs: 20_000,
    });
    expect(invokeEdgeFunctionMock.mock.calls[0][1].body).not.toHaveProperty('userId');
  });

  it('sends only the desired visibility state', async () => {
    const result = {
      courseId: 'course-1',
      hidden: true,
      metadata: { contractVersion: 1, generatedAt: '2026-07-21T13:00:00.000Z' },
      moodleActivityId: 'activity-1',
      updatedCount: 2,
    };
    invokeEdgeFunctionMock.mockResolvedValueOnce(result);

    await expect(
      setCourseActivityVisibility('course-1', 'activity-1', true),
    ).resolves.toBe(result);

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('course-panel', {
      auth: 'required',
      body: {
        action: 'set_activity_visibility',
        courseId: 'course-1',
        hidden: true,
        moodleActivityId: 'activity-1',
      },
      signal: undefined,
      timeoutMs: 20_000,
    });
  });

  it('rejects nested data outside the transport contract', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      ...panelResponse,
      activities: [{
        ...panelResponse.activities[0],
        submissionCounts: {
          ...panelResponse.activities[0].submissionCounts,
          total: 2,
        },
      }],
    });

    await expect(getCoursePanel('course-1')).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
});
