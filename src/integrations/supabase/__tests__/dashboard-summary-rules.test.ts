import { describe, expect, it } from 'vitest';

import { getStudentActivityWorkflowStatus } from '../../../../supabase/functions/_shared/domain/student-activity-status.ts';
import {
  countNewAtRiskStudents,
  getActiveDashboardEnrollmentScope,
  getDashboardPeriod,
  isDashboardActivityInScope,
  isDashboardActivityPendingCorrection,
  isDashboardActivityPendingSubmission,
  listOngoingDashboardCourseIds,
} from '../../../../supabase/functions/dashboard-summary/rules.ts';

const baseActivity = {
  activityType: 'assign',
  courseId: 'course-1',
  dueAt: '2026-07-20T12:00:00.000Z',
  grade: null,
  gradeMax: 10,
  hidden: false,
  studentId: 'student-1',
};

describe('dashboard summary domain rules', () => {
  it('uses closed civil weeks in Sao Paulo instead of a rolling UTC window', () => {
    const now = new Date('2026-07-21T02:30:00.000Z'); // Monday 23:30 in Sao Paulo.

    expect(getDashboardPeriod(now, 'current')).toEqual({
      todayEndsAt: '2026-07-21T03:00:00.000Z',
      todayStartsAt: '2026-07-20T03:00:00.000Z',
      weekEndsAt: '2026-07-27T03:00:00.000Z',
      weekStartsAt: '2026-07-20T03:00:00.000Z',
    });
    expect(getDashboardPeriod(now, 'last')).toMatchObject({
      weekEndsAt: '2026-07-20T03:00:00.000Z',
      weekStartsAt: '2026-07-13T03:00:00.000Z',
    });
  });

  it('keeps only ongoing modules using their effective grouped end dates', () => {
    const courses = [
      {
        category: 'SENAI > Escola > Curso > Turma',
        endAt: '2026-12-31T23:59:59.000Z',
        id: 'module-1',
        startAt: '2026-01-01T03:00:00.000Z',
      },
      {
        category: 'SENAI > Escola > Curso > Turma',
        endAt: '2026-12-31T23:59:59.000Z',
        id: 'module-2',
        startAt: '2026-06-01T03:00:00.000Z',
      },
    ];

    expect(listOngoingDashboardCourseIds(courses, new Date('2026-07-01T12:00:00.000Z')))
      .toEqual(['module-2']);
  });

  it('scopes activities by active student-course pair', () => {
    const scope = getActiveDashboardEnrollmentScope([
      { courseId: 'course-1', status: 'ativo', studentId: 'student-1' },
      { courseId: 'course-2', status: 'suspenso', studentId: 'student-1' },
      { courseId: 'course-1', status: 'concluido', studentId: 'student-2' },
    ]);

    expect([...scope.studentIds]).toEqual(['student-1']);
    expect(isDashboardActivityInScope(baseActivity, scope.enrollmentKeys)).toBe(true);
    expect(isDashboardActivityInScope(
      { ...baseActivity, courseId: 'course-2' },
      scope.enrollmentKeys,
    )).toBe(false);
  });

  it('requires real submission evidence before placing assignments in the review queue', () => {
    expect(getStudentActivityWorkflowStatus({
      activity_type: 'assign',
      completed_at: '2026-07-20T12:00:00.000Z',
      grade: null,
      grade_max: 10,
      submitted_at: null,
    })).toBe('completed');

    expect(isDashboardActivityPendingCorrection({
      ...baseActivity,
      completedAt: '2026-07-20T12:00:00.000Z',
    })).toBe(false);
    expect(isDashboardActivityPendingCorrection({
      ...baseActivity,
      submittedAt: '2026-07-20T12:00:00.000Z',
    })).toBe(true);
    expect(isDashboardActivityPendingCorrection({
      ...baseActivity,
      hidden: true,
      submittedAt: '2026-07-20T12:00:00.000Z',
    })).toBe(false);
  });

  it('counts only overdue, visible, weighted and unsubmitted activities', () => {
    const now = new Date('2026-07-21T12:00:00.000Z');

    expect(isDashboardActivityPendingSubmission(baseActivity, now)).toBe(true);
    expect(isDashboardActivityPendingSubmission({
      ...baseActivity,
      dueAt: now.toISOString(),
    }, now)).toBe(false);
    expect(isDashboardActivityPendingSubmission({
      ...baseActivity,
      gradeMax: 0,
    }, now)).toBe(false);
    expect(isDashboardActivityPendingSubmission({
      ...baseActivity,
      submittedAt: '2026-07-20T13:00:00.000Z',
    }, now)).toBe(false);
  });

  it('deduplicates risk transitions and ignores inactive students', () => {
    expect(countNewAtRiskStudents([
      { studentId: 'student-1' },
      { studentId: 'student-1' },
      { studentId: 'student-2' },
    ], new Set(['student-1']))).toBe(1);
  });
});
