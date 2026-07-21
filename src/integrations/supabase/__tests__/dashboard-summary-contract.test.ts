import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseDashboardSummaryPayload } from '../../../../supabase/functions/dashboard-summary/payload.ts';
import type { DashboardSummaryRepository } from '../../../../supabase/functions/dashboard-summary/repository.ts';
import { getDashboardSummary } from '../../../../supabase/functions/dashboard-summary/service.ts';

function createRepository(): DashboardSummaryRepository {
  return {
    countEvents: vi.fn(async () => 2),
    countTasks: vi.fn(async () => 3),
    getDataUpdatedAt: vi.fn(async () => '2026-07-21T10:00:00.000Z'),
    listActivities: vi.fn(async () => []),
    listCourses: vi.fn(async () => []),
    listEnrollments: vi.fn(async () => []),
    listFeed: vi.fn(async () => []),
    listRiskTransitions: vi.fn(async () => []),
    listStudents: vi.fn(async () => []),
    listTutorCourseIds: vi.fn(async () => []),
    userCanViewDashboard: vi.fn(async () => true),
  };
}

const now = new Date('2026-07-21T15:00:00.000Z');

describe('dashboard-summary HTTP contract', () => {
  let repository: DashboardSummaryRepository;

  beforeEach(() => {
    repository = createRepository();
  });

  it('accepts the V1 use-case payload without browser identity', () => {
    expect(parseDashboardSummaryPayload({
      action: 'get_summary',
      courseId: '11111111-1111-4111-8111-111111111111',
      week: 'last',
    })).toEqual({
      action: 'get_summary',
      courseId: '11111111-1111-4111-8111-111111111111',
      week: 'last',
    });
  });

  it.each([
    {},
    { action: 'unknown', week: 'current' },
    { action: 'get_summary', week: 'rolling' },
    { action: 'get_summary', courseId: 'not-an-id', week: 'current' },
    { action: 'get_summary', userId: 'spoofed', week: 'current' },
    { action: 'get_summary', courseIds: [], week: 'current' },
    { action: 'get_summary', timeZone: 'UTC', week: 'current' },
  ])('rejects invalid fields and client-provided scope: %o', (payload) => {
    expect(() => parseDashboardSummaryPayload(payload)).toThrowError(
      expect.objectContaining({ status: 422 }),
    );
  });

  it('returns an empty versioned DTO when the actor follows no ongoing course', async () => {
    const result = await getDashboardSummary(repository, 'authenticated-user', {
      action: 'get_summary',
      week: 'current',
    }, { now });

    expect(repository.listTutorCourseIds).toHaveBeenCalledWith('authenticated-user');
    expect(repository.listEnrollments).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      indicators: {
        activitiesToReview: 0,
        studentsAtRisk: 0,
        todayEvents: 0,
      },
      metadata: {
        appliedCourseCount: 0,
        contractVersion: 1,
        timeZone: 'America/Sao_Paulo',
      },
    });
  });

  it('applies active enrollment, academic, risk and list rules in one backend use case', async () => {
    vi.mocked(repository.listTutorCourseIds).mockResolvedValue(['course-1', 'course-2']);
    vi.mocked(repository.listCourses).mockResolvedValue([
      { id: 'course-1', name: 'Curso 1', shortName: 'C1' },
      { id: 'course-2', name: 'Curso 2', shortName: 'C2' },
    ]);
    vi.mocked(repository.listEnrollments).mockResolvedValue([
      { courseId: 'course-1', status: 'ativo', studentId: 'student-1' },
      { courseId: 'course-1', status: 'ativo', studentId: 'student-2' },
      { courseId: 'course-2', status: 'suspenso', studentId: 'student-1' },
    ]);
    vi.mocked(repository.listStudents).mockResolvedValue([
      { id: 'student-1', name: 'Ana', riskLevel: 'critico', riskReasons: ['nota'] },
      { id: 'student-2', name: 'Bruno', riskLevel: 'normal' },
    ]);
    vi.mocked(repository.listActivities).mockResolvedValue([
      {
        activityType: 'assign',
        courseId: 'course-1',
        dueAt: '2026-07-19T12:00:00.000Z',
        grade: null,
        gradeMax: 10,
        id: 'review-1',
        name: 'Trabalho',
        studentId: 'student-1',
        submittedAt: '2026-07-20T12:00:00.000Z',
      },
      {
        activityType: 'assignment',
        courseId: 'course-1',
        dueAt: '2026-07-20T12:00:00.000Z',
        grade: null,
        gradeMax: 10,
        id: 'pending-1',
        name: 'Questionario',
        studentId: 'student-2',
      },
      {
        activityType: 'assign',
        courseId: 'course-2',
        dueAt: '2026-07-19T12:00:00.000Z',
        grade: null,
        gradeMax: 10,
        id: 'suspended-course',
        name: 'Nao pode contar',
        studentId: 'student-1',
        submittedAt: '2026-07-20T12:00:00.000Z',
      },
    ]);
    vi.mocked(repository.listRiskTransitions).mockResolvedValue([
      { studentId: 'student-1' },
      { studentId: 'student-1' },
    ]);
    vi.mocked(repository.listFeed).mockResolvedValue([{
      eventType: 'risk_change',
      id: 'feed-1',
      occurredAt: '2026-07-21T14:00:00.000Z',
      studentId: 'student-1',
      title: 'Risco atualizado',
    }]);

    const result = await getDashboardSummary(repository, 'authenticated-user', {
      action: 'get_summary',
      week: 'current',
    }, { now });

    expect(result.indicators).toEqual({
      activeNormalStudents: 1,
      activitiesToReview: 1,
      newAtRiskThisWeek: 1,
      pendingCorrectionAssignments: 1,
      pendingSubmissionAssignments: 1,
      studentsAtRisk: 1,
      todayEvents: 2,
      todayTasks: 3,
    });
    expect(result.criticalStudents).toEqual([expect.objectContaining({
      id: 'student-1',
      name: 'Ana',
      riskLevel: 'critico',
    })]);
    expect(result.activitiesToReview).toEqual([expect.objectContaining({
      id: 'review-1',
      student: { id: 'student-1', name: 'Ana', riskLevel: 'critico' },
    })]);
    expect(result.activityFeed[0]).toMatchObject({
      id: 'feed-1',
      student: { id: 'student-1', name: 'Ana' },
    });
    expect(repository.listRiskTransitions).toHaveBeenCalledWith({
      endsAt: now.toISOString(),
      startsAt: '2026-07-20T03:00:00.000Z',
      studentIds: ['student-1', 'student-2'],
    });
  });

  it('does not query scoped data when a requested course is not followed and ongoing', async () => {
    vi.mocked(repository.listTutorCourseIds).mockResolvedValue(['course-1']);
    vi.mocked(repository.listCourses).mockResolvedValue([{ id: 'course-1', name: 'Curso 1' }]);

    const result = await getDashboardSummary(repository, 'authenticated-user', {
      action: 'get_summary',
      courseId: '22222222-2222-4222-8222-222222222222',
      week: 'current',
    }, { now });

    expect(repository.listEnrollments).not.toHaveBeenCalled();
    expect(result.metadata).toMatchObject({ appliedCourseCount: 0 });
  });
});
