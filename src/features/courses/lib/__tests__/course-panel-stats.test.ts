import { describe, expect, it } from 'vitest';

import type { Student } from '@/features/students/types';
import type { StudentActivity } from '../../types';
import { buildCoursePanelStats, isEnrollmentCountedAsEnrolled } from '../course-panel-stats';

function student(id: string, current_risk_level: Student['current_risk_level']): Student {
  return {
    id,
    moodle_user_id: id,
    full_name: `Aluno ${id}`,
    current_risk_level,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function activity(
  id: string,
  studentId: string,
  overrides: Partial<StudentActivity> = {},
): StudentActivity {
  return {
    id: `${studentId}-${id}`,
    student_id: studentId,
    course_id: 'course-1',
    moodle_activity_id: id,
    activity_name: `Atividade ${id}`,
    activity_type: 'assign',
    grade: null,
    grade_max: 10,
    percentage: null,
    status: 'pending',
    completed_at: null,
    submitted_at: null,
    graded_at: null,
    due_date: null,
    hidden: false,
    ...overrides,
  };
}

describe('course panel stats', () => {
  it('counts enrolled students and completion from real submission/correction evidence', () => {
    const stats = buildCoursePanelStats({
      students: [
        student('s-1', 'risco'),
        student('s-2', 'critico'),
        student('s-3', 'critico'),
      ],
      enrollmentRows: [
        { student_id: 's-1', enrollment_status: 'ativo' },
        { student_id: 's-2', enrollment_status: 'suspenso' },
        { student_id: 's-3', enrollment_status: 'concluido' },
      ],
      activities: [
        activity('a-1', 's-1'),
        activity('a-2', 's-1'),
      ],
      activityRecords: [
        activity('a-1', 's-1', { status: 'graded', grade: 8 }),
        activity('a-2', 's-1'),
        activity('a-1', 's-2', { status: 'graded', grade: 9 }),
        activity('a-1', 's-3', { status: 'submitted', submitted_at: '2026-03-01T00:00:00.000Z' }),
      ],
      isCourseInProgress: true,
    });

    expect(stats.totalStudents).toBe(2);
    expect(stats.atRiskStudents).toBe(1);
    expect(stats.totalActivities).toBe(2);
    expect(stats.completionRate).toBe(67);
    expect(stats.riskDistribution).toEqual({
      normal: 0,
      atencao: 0,
      risco: 1,
      critico: 0,
    });
  });

  it('excludes hidden activities from synced activity count and completion rate', () => {
    const stats = buildCoursePanelStats({
      students: [student('s-1', 'normal')],
      enrollmentRows: [{ student_id: 's-1', enrollment_status: 'ativo' }],
      activities: [
        activity('a-1', 's-1'),
        activity('a-2', 's-1', { hidden: true }),
      ],
      activityRecords: [
        activity('a-1', 's-1'),
        activity('a-2', 's-1', { hidden: true, status: 'graded', grade: 10 }),
      ],
      isCourseInProgress: true,
    });

    expect(stats.totalActivities).toBe(1);
    expect(stats.completionRate).toBe(0);
  });

  it('treats empty and completed statuses as enrolled, but excludes inactive statuses', () => {
    expect(isEnrollmentCountedAsEnrolled(null)).toBe(true);
    expect(isEnrollmentCountedAsEnrolled('concluido')).toBe(true);
    expect(isEnrollmentCountedAsEnrolled('suspenso')).toBe(false);
    expect(isEnrollmentCountedAsEnrolled('não atualmente')).toBe(false);
  });
});
