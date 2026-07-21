import { describe, expect, it } from 'vitest';

import {
  buildStudentHistory,
  buildStudentProfileCourses,
  normalizeStudentRiskLevel,
} from '../../../../supabase/functions/students/rules.ts';

const COURSE_A = '11111111-1111-4111-8111-111111111111';
const COURSE_B = '22222222-2222-4222-8222-222222222222';

describe('students domain rules', () => {
  it('normalizes unknown or absent risk without leaking persistence values', () => {
    expect(normalizeStudentRiskLevel('CRITICO')).toBe('critico');
    expect(normalizeStudentRiskLevel(null)).toBe('normal');
    expect(normalizeStudentRiskLevel('unexpected')).toBe('normal');
  });

  it('keeps weighted activities, picks the latest course grade and orders workflow stably', () => {
    const courses = buildStudentProfileCourses({
      courses: [{ endAt: null, id: COURSE_A, name: 'Curso A', shortName: 'A', startAt: null }],
      grades: [
        { courseId: COURSE_A, formatted: '7', id: 'grade-old', lastSyncedAt: '2026-01-01T00:00:00Z', letter: null, maximum: 10, percentage: 70, raw: 7 },
        { courseId: COURSE_A, formatted: '8', id: 'grade-new', lastSyncedAt: '2026-02-01T00:00:00Z', letter: null, maximum: 10, percentage: 80, raw: 8 },
      ],
      activities: [
        {
          activityType: 'assign', completedAt: null, courseId: COURSE_A,
          dueAt: '2026-07-20T00:00:00Z', grade: null, gradeMaximum: 10,
          gradedAt: null, hidden: false, id: 'pending-submit', moodleActivityId: '1',
          name: 'Enviar trabalho', percentage: null, status: 'pending', submittedAt: null,
        },
        {
          activityType: 'assign', completedAt: null, courseId: COURSE_A,
          dueAt: '2026-07-19T00:00:00Z', grade: null, gradeMaximum: 10,
          gradedAt: null, hidden: false, id: 'pending-correction', moodleActivityId: '2',
          name: 'Corrigir trabalho', percentage: null, status: 'submitted', submittedAt: '2026-07-18T00:00:00Z',
        },
        {
          activityType: 'assign', completedAt: null, courseId: COURSE_A,
          dueAt: null, grade: null, gradeMaximum: 0,
          gradedAt: null, hidden: false, id: 'not-weighted', moodleActivityId: '3',
          name: 'Sem peso', percentage: null, status: 'pending', submittedAt: null,
        },
      ],
    });

    expect(courses).toHaveLength(1);
    expect(courses[0].grade?.raw).toBe(8);
    expect(courses[0].activities.map((activity) => activity.id)).toEqual([
      'pending-correction',
      'pending-submit',
    ]);
  });

  it('uses current pending counts when present, preserves snapshot zero-course fallback and orders past courses last', () => {
    const result = buildStudentHistory({
      now: new Date('2026-07-21T12:00:00.000Z'),
      courses: [
        { endAt: '2026-12-31T00:00:00Z', id: COURSE_A, name: 'Atual', shortName: 'A', startAt: '2026-06-01T00:00:00Z' },
        { endAt: '2026-01-31T00:00:00Z', id: COURSE_B, name: 'Encerrado', shortName: 'B', startAt: '2026-01-01T00:00:00Z' },
      ],
      activities: [{
        activityType: 'assign', completedAt: null, courseId: COURSE_A,
        dueAt: '2026-07-20T00:00:00Z', grade: null, gradeMaximum: 10,
        gradedAt: null, hidden: false, id: 'activity-1', moodleActivityId: '1',
        name: 'Pendente', percentage: null, status: 'pending', submittedAt: null,
      }],
      snapshots: [
        { courseId: COURSE_B, createdAt: '2026-07-01T00:00:00Z', daysSinceAccess: 10, enrollmentStatus: 'concluido', id: 'snapshot-b', lastAccessAt: null, overdueActivities: 2, pendingActivities: 3, riskLevel: 'normal', synchronizedAt: '2026-07-01T00:00:00Z' },
        { courseId: COURSE_A, createdAt: '2026-07-02T00:00:00Z', daysSinceAccess: 1, enrollmentStatus: 'ativo', id: 'snapshot-a', lastAccessAt: null, overdueActivities: 0, pendingActivities: 0, riskLevel: 'risco', synchronizedAt: '2026-07-02T00:00:00Z' },
      ],
    });

    expect(result.map((snapshot) => snapshot.id)).toEqual(['snapshot-a', 'snapshot-b']);
    expect(result[0]).toMatchObject({ pendingActivities: 1, overdueActivities: 1 });
    expect(result[1]).toMatchObject({ pendingActivities: 3, overdueActivities: 2 });
  });
});
