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
  listCatalogCourses,
  setCourseAssociationRole,
  setCourseAttendanceEnabled,
  setCoursesIgnored,
} from '../courses-catalog';

const catalogResponse = {
  items: [{
    atRiskStudentCount: 2,
    category: 'Escola > Curso',
    createdAt: '2026-01-01T00:00:00.000Z',
    effectiveEndsAt: '2026-12-31T00:00:00.000Z',
    endsAt: '2026-12-31T00:00:00.000Z',
    id: 'course-1',
    isAttendanceEnabled: false,
    isFollowing: true,
    isIgnored: false,
    lastSynchronizedAt: '2026-07-21T14:00:00.000Z',
    lifecycleStatus: 'em_andamento',
    moodleCourseId: 'moodle-1',
    name: 'Matematica',
    shortName: 'MAT',
    startsAt: '2026-01-01T00:00:00.000Z',
    studentCount: 20,
    studentIds: ['student-1'],
    updatedAt: '2026-07-21T14:00:00.000Z',
  }],
  metadata: { contractVersion: 1, generatedAt: '2026-07-21T15:00:00.000Z' },
};

describe('courses catalog API client', () => {
  beforeEach(() => {
    invokeEdgeFunctionMock.mockReset();
  });

  it('loads and maps the catalog without sending user identity', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce(catalogResponse);
    const controller = new AbortController();

    await expect(listCatalogCourses(controller.signal)).resolves.toEqual([
      expect.objectContaining({
        id: 'course-1',
        moodle_course_id: 'moodle-1',
        students_count: 20,
        at_risk_count: 2,
        is_following: true,
        effective_end_date: '2026-12-31T00:00:00.000Z',
      }),
    ]);

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('courses-catalog', {
      auth: 'required',
      body: { action: 'get_catalog' },
      signal: controller.signal,
      timeoutMs: 20_000,
    });
    expect(invokeEdgeFunctionMock.mock.calls[0][1].body).not.toHaveProperty('userId');
  });

  it('sends desired command states instead of frontend write sequences', async () => {
    invokeEdgeFunctionMock
      .mockResolvedValueOnce({ action: 'set_association_role', affectedCourseCount: 1, contractVersion: 1 })
      .mockResolvedValueOnce({ action: 'set_ignored', affectedCourseCount: 1, contractVersion: 1 })
      .mockResolvedValueOnce({ action: 'set_attendance_enabled', affectedCourseCount: 1, contractVersion: 1 });

    await setCourseAssociationRole(['course-1'], 'viewer');
    await setCoursesIgnored(['course-1'], true);
    await setCourseAttendanceEnabled(['course-1'], false);

    expect(invokeEdgeFunctionMock.mock.calls.map((call) => call[1].body)).toEqual([
      { action: 'set_association_role', courseIds: ['course-1'], role: 'viewer' },
      { action: 'set_ignored', courseIds: ['course-1'], ignored: true },
      { action: 'set_attendance_enabled', courseIds: ['course-1'], enabled: false },
    ]);
  });

  it('partitions more than 200 courses into sequential atomic requests', async () => {
    const courseIds = Array.from({ length: 405 }, (_, index) => `course-${index + 1}`);
    invokeEdgeFunctionMock.mockImplementation(async (_name, options) => ({
      action: 'set_ignored',
      affectedCourseCount: options.body.courseIds.length,
      contractVersion: 1,
    }));

    await expect(setCoursesIgnored(courseIds, true)).resolves.toEqual({
      action: 'set_ignored',
      affectedCourseCount: 405,
      contractVersion: 1,
    });

    expect(invokeEdgeFunctionMock).toHaveBeenCalledTimes(3);
    expect(invokeEdgeFunctionMock.mock.calls.map((call) => call[1].body.courseIds)).toEqual([
      courseIds.slice(0, 200),
      courseIds.slice(200, 400),
      courseIds.slice(400),
    ]);
  });

  it('stops after a failed chunk and never reports partial commands as success', async () => {
    const courseIds = Array.from({ length: 401 }, (_, index) => `course-${index + 1}`);
    const failure = new Error('second chunk failed');
    invokeEdgeFunctionMock
      .mockResolvedValueOnce({
        action: 'set_attendance_enabled',
        affectedCourseCount: 200,
        contractVersion: 1,
      })
      .mockRejectedValueOnce(failure);

    await expect(setCourseAttendanceEnabled(courseIds, true)).rejects.toBe(failure);

    expect(invokeEdgeFunctionMock).toHaveBeenCalledTimes(2);
    expect(invokeEdgeFunctionMock.mock.calls[1][1].body.courseIds).toEqual(
      courseIds.slice(200, 400),
    );
  });

  it('rejects a catalog response outside the versioned contract', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      ...catalogResponse,
      items: [{ ...catalogResponse.items[0], studentCount: '20' }],
    });

    await expect(listCatalogCourses()).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
