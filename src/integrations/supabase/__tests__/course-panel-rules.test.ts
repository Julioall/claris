import { describe, expect, it } from 'vitest';

import {
  buildCoursePanelActivities,
  buildCoursePanelStats,
  getCoursePanelLifecycle,
  getCoursePanelWorkflowStatus,
  getEffectiveCourseEndDate,
  isCoursePanelEnrollmentCounted,
  isCoursePanelEnrollmentRiskEligible,
  type CoursePanelActivityRuleInput,
} from '../../../../supabase/functions/course-panel/rules.ts';

function activity(
  id: string,
  studentId: string,
  overrides: Partial<CoursePanelActivityRuleInput> = {},
): CoursePanelActivityRuleInput {
  return {
    activityType: 'assign',
    courseId: 'course-1',
    grade: null,
    gradeMax: 10,
    hidden: false,
    id: `${id}-${studentId}`,
    moodleActivityId: id,
    name: `Atividade ${id}`,
    percentage: null,
    studentId,
    ...overrides,
  };
}

describe('course-panel backend rules', () => {
  it('uses accessible peer modules to derive effective end date and lifecycle', () => {
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

    const effectiveEndsAt = getEffectiveCourseEndDate('module-1', courses);
    expect(effectiveEndsAt).toBe('2026-06-01T03:00:00.000Z');
    expect(getCoursePanelLifecycle(
      courses[0],
      effectiveEndsAt,
      new Date('2026-03-01T12:00:00.000Z'),
    )).toBe('inProgress');
    expect(getCoursePanelLifecycle(
      courses[0],
      effectiveEndsAt,
      new Date('2026-07-01T12:00:00.000Z'),
    )).toBe('finished');
  });

  it('normalizes enrollment aliases while keeping risk scope stricter', () => {
    expect(isCoursePanelEnrollmentCounted(null)).toBe(true);
    expect(isCoursePanelEnrollmentCounted('concluido')).toBe(true);
    expect(isCoursePanelEnrollmentCounted('SUSPENSO')).toBe(false);
    expect(isCoursePanelEnrollmentCounted('não atualmente')).toBe(false);
    expect(isCoursePanelEnrollmentRiskEligible(null)).toBe(true);
    expect(isCoursePanelEnrollmentRiskEligible('Ativo')).toBe(true);
    expect(isCoursePanelEnrollmentRiskEligible('concluido')).toBe(false);
  });

  it('calculates workflow from evidence instead of exposing persistence status', () => {
    expect(getCoursePanelWorkflowStatus(activity('a-1', 's-1', {
      completedAt: '2026-01-01T12:00:00.000Z',
    }))).toBe('completed');
    expect(getCoursePanelWorkflowStatus(activity('a-1', 's-1', {
      submittedAt: '2026-01-01T12:00:00.000Z',
    }))).toBe('pendingCorrection');
    expect(getCoursePanelWorkflowStatus(activity('a-1', 's-1', {
      grade: -1,
    }))).toBe('corrected');
    expect(getCoursePanelWorkflowStatus(activity('a-1', 's-1'))).toBe('pendingSubmission');
  });

  it('canonicalizes inconsistent shared metadata independently of row order', () => {
    const records = [
      activity('a-1', 'student-c', {
        activityType: 'quiz',
        dueAt: '2026-02-20T12:00:00.000Z',
        hidden: false,
        id: 'record-c',
        name: 'Nome antigo',
        visibilityOverrideHidden: false,
      }),
      activity('a-1', 'student-b', {
        dueAt: '2026-02-10T12:00:00.000Z',
        hidden: false,
        id: 'record-b',
        name: 'Trabalho',
        visibilityOverrideHidden: false,
      }),
      activity('a-1', 'student-a', {
        dueAt: '2026-02-10T12:00:00.000Z',
        hidden: true,
        id: 'record-a',
        name: 'Trabalho',
        visibilityOverrideHidden: false,
      }),
    ];
    const studentNames = new Map([
      ['student-a', 'Ana'],
      ['student-b', 'Bruno'],
      ['student-c', 'Carla'],
    ]);
    const activities = buildCoursePanelActivities(records, studentNames);
    const reversedActivities = buildCoursePanelActivities([...records].reverse(), studentNames);

    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      dueAt: '2026-02-10T12:00:00.000Z',
      hidden: false,
      id: 'record-a',
      isAssignment: true,
      name: 'Trabalho',
      submissionCounts: { pendingSubmission: 3, total: 3 },
      type: 'assign',
    });
    expect(activities[0].submissions.map((submission) => submission.studentId)).toEqual([
      'student-a',
      'student-b',
      'student-c',
    ]);
    expect(reversedActivities).toEqual(activities);
  });

  it('conservatively hides conflicting legacy rows when no manual override exists', () => {
    const records = [
      activity('a-1', 'student-a', { hidden: false }),
      activity('a-1', 'student-b', { hidden: true }),
    ];
    const studentNames = new Map([
      ['student-a', 'Ana'],
      ['student-b', 'Bruno'],
    ]);

    const activities = buildCoursePanelActivities(records, studentNames);
    const reversedRecords = [...records].reverse();
    const reversedActivities = buildCoursePanelActivities(reversedRecords, studentNames);
    const sharedStatsInput = {
      enrollments: [
        { enrollmentStatus: 'ativo', studentId: 'student-a' },
        { enrollmentStatus: 'ativo', studentId: 'student-b' },
      ],
      lifecycle: 'inProgress' as const,
      students: [
        { id: 'student-a', riskLevel: 'normal' },
        { id: 'student-b', riskLevel: 'normal' },
      ],
    };

    expect(activities[0].hidden).toBe(true);
    expect(reversedActivities).toEqual(activities);
    expect(buildCoursePanelStats({
      ...sharedStatsInput,
      activities,
      activityRecords: records,
    })).toEqual(buildCoursePanelStats({
      ...sharedStatsInput,
      activities: reversedActivities,
      activityRecords: reversedRecords,
    }));
    expect(buildCoursePanelStats({
      ...sharedStatsInput,
      activities,
      activityRecords: records,
    })).toMatchObject({
      completionRate: 0,
      totalActivities: 0,
    });
  });

  it('counts visible evidence and suppresses risk distribution outside an ongoing course', () => {
    const records = [
      activity('a-1', 's-1', { grade: 8 }),
      activity('a-2', 's-1'),
      activity('a-1', 's-2', { grade: 9 }),
      activity('a-1', 's-3', { submittedAt: '2026-01-01T12:00:00.000Z' }),
    ];
    const activities = buildCoursePanelActivities(records, new Map([
      ['s-1', 'Ana'],
      ['s-2', 'Bia'],
      ['s-3', 'Carla'],
    ]));
    const input = {
      activities,
      activityRecords: records,
      enrollments: [
        { enrollmentStatus: 'ativo', studentId: 's-1' },
        { enrollmentStatus: 'suspenso', studentId: 's-2' },
        { enrollmentStatus: 'concluido', studentId: 's-3' },
      ],
      students: [
        { id: 's-1', riskLevel: 'risco' },
        { id: 's-2', riskLevel: 'critico' },
        { id: 's-3', riskLevel: 'critico' },
      ],
    };

    expect(buildCoursePanelStats({ ...input, lifecycle: 'inProgress' })).toEqual({
      atRiskStudents: 1,
      completionRate: 67,
      riskDistribution: { atencao: 0, critico: 0, normal: 0, risco: 1 },
      totalActivities: 2,
      totalStudents: 2,
    });
    expect(buildCoursePanelStats({ ...input, lifecycle: 'finished' }).riskDistribution).toEqual({
      atencao: 0,
      critico: 0,
      normal: 0,
      risco: 0,
    });
  });
});
