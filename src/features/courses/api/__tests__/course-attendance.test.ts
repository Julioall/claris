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
  getCourseAttendanceOverview,
  getCourseAttendanceSheet,
  saveCourseAttendance,
} from '../course-attendance';

const overview = {
  dateSummaries: [],
  metadata: {
    contractVersion: 1,
    generatedAt: '2026-07-21T15:00:00.000Z',
    hasMore: false,
    limit: 120,
    offset: 0,
  },
  records: [],
  students: [{ email: null, id: 'student-1', name: 'Ana' }],
};

describe('course attendance API client', () => {
  beforeEach(() => {
    invokeEdgeFunctionMock.mockReset();
  });

  it('loads the overview without sending browser identity', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce(overview);
    const controller = new AbortController();

    await expect(getCourseAttendanceOverview('course-1', controller.signal)).resolves.toBe(overview);

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('course-attendance', {
      auth: 'required',
      body: { action: 'get_overview', courseId: 'course-1' },
      signal: controller.signal,
      timeoutMs: 20_000,
    });
    expect(invokeEdgeFunctionMock.mock.calls[0][1].body).not.toHaveProperty('userId');
  });

  it('loads a date sheet and saves domain entries', async () => {
    invokeEdgeFunctionMock
      .mockResolvedValueOnce({
        courseId: 'course-1',
        date: '2026-07-21',
        entries: [],
        metadata: { contractVersion: 1, generatedAt: '2026-07-21T15:00:00.000Z' },
      })
      .mockResolvedValueOnce({
        courseId: 'course-1',
        date: '2026-07-21',
        savedCount: 1,
        metadata: { contractVersion: 1, generatedAt: '2026-07-21T15:00:00.000Z' },
      });

    await getCourseAttendanceSheet('course-1', '2026-07-21');
    await saveCourseAttendance({
      courseId: 'course-1',
      date: '2026-07-21',
      entries: [{ studentId: 'student-1', status: 'presente', notes: null }],
    });

    expect(invokeEdgeFunctionMock).toHaveBeenNthCalledWith(2, 'course-attendance', {
      auth: 'required',
      body: {
        action: 'save_sheet',
        courseId: 'course-1',
        date: '2026-07-21',
        entries: [{ studentId: 'student-1', status: 'presente', notes: null }],
      },
      signal: undefined,
      timeoutMs: 20_000,
    });
  });

  it('rejects an invalid transport response', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({ ...overview, records: [{ status: 'other' }] });

    await expect(getCourseAttendanceOverview('course-1')).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it.each([
    [{ date: '2026-07-21', presente: 1, ausente: 0, justificado: 0, total: 2 }],
    [{ date: '2026-07-21', presente: -1, ausente: 0, justificado: 0, total: -1 }],
    [{ date: '21/07/2026', presente: 1, ausente: 0, justificado: 0, total: 1 }],
  ])('rejects malformed date summaries: %o', async (dateSummaries) => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({ ...overview, dateSummaries });

    await expect(getCourseAttendanceOverview('course-1')).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
});
