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
  getAcademicGradesReport,
  getAcademicPendingActivitiesReport,
  listAcademicReportCourses,
} from '../academic-reports';

const course = {
  category: 'Turma A',
  effectiveEndsAt: '2026-12-31T00:00:00.000Z',
  endsAt: '2026-12-31T00:00:00.000Z',
  id: 'course-1',
  lifecycleStatus: 'em_andamento',
  name: 'Matematica',
  shortName: 'MAT',
  startsAt: '2026-01-01T00:00:00.000Z',
};

const metadata = {
  contractVersion: 1,
  generatedAt: '2026-07-21T12:00:00.000Z',
};

describe('academic reports API client', () => {
  beforeEach(() => {
    invokeEdgeFunctionMock.mockReset();
  });

  it('lists lean report courses without sending browser identity', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({ items: [course], metadata });
    const controller = new AbortController();

    await expect(listAcademicReportCourses(controller.signal)).resolves.toEqual([course]);
    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('academic-reports', {
      auth: 'required',
      body: { action: 'list_courses' },
      signal: controller.signal,
      timeoutMs: 20_000,
    });
    expect(invokeEdgeFunctionMock.mock.calls[0][1].body).not.toHaveProperty('userId');
  });

  it('requests a consolidated grades report', async () => {
    const report = {
      metadata,
      students: [{
        grades: [{ courseId: 'course-1', gradePercentage: 90, gradeRaw: 18 }],
        isSuspended: false,
        lastAccessAt: null,
        name: 'Ana',
        studentId: 'student-1',
      }],
      units: [course],
    };
    invokeEdgeFunctionMock.mockResolvedValueOnce(report);

    await expect(getAcademicGradesReport(['course-1'], false)).resolves.toBe(report);
    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('academic-reports', {
      auth: 'required',
      body: {
        action: 'get_grades_report',
        courseIds: ['course-1'],
        includeSuspendedStudents: false,
      },
      signal: undefined,
      timeoutMs: 60_000,
    });
  });

  it('requests pending details and verifies summary consistency', async () => {
    const report = {
      details: [{
        activityName: 'Trabalho',
        activityType: 'assign',
        courseId: 'course-1',
        studentId: 'student-1',
        unitName: 'Matematica',
        workflowStatus: 'pendingSubmission',
      }],
      metadata,
      students: [{
        lastAccessAt: null,
        name: 'Ana',
        pendingCorrectionCount: 0,
        pendingSubmissionCount: 1,
        studentId: 'student-1',
        totalCount: 1,
      }],
    };
    invokeEdgeFunctionMock.mockResolvedValueOnce(report);

    await expect(getAcademicPendingActivitiesReport(['course-1'])).resolves.toBe(report);
    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('academic-reports', {
      auth: 'required',
      body: {
        action: 'get_pending_activities_report',
        courseIds: ['course-1'],
      },
      signal: undefined,
      timeoutMs: 60_000,
    });
  });

  it('rejects grades outside the returned unit contract', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      metadata,
      students: [{
        grades: [{ courseId: 'foreign-course', gradePercentage: 90, gradeRaw: 18 }],
        isSuspended: false,
        lastAccessAt: null,
        name: 'Ana',
        studentId: 'student-1',
      }],
      units: [course],
    });

    await expect(getAcademicGradesReport(['course-1'], true)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('rejects inconsistent pending summary counts', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      details: [],
      metadata,
      students: [{
        lastAccessAt: null,
        name: 'Ana',
        pendingCorrectionCount: 0,
        pendingSubmissionCount: 1,
        studentId: 'student-1',
        totalCount: 1,
      }],
    });

    await expect(getAcademicPendingActivitiesReport(['course-1'])).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
});
