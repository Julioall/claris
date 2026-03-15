import { describe, expect, it } from 'vitest';
import {
  getCourseEffectiveEndDate,
  getCourseLifecycleStatus,
  isCourseEffectivelyActive,
  withEffectiveCourseDates,
} from '@/lib/course-dates';

describe('withEffectiveCourseDates', () => {
  it('uses the next unit start date when all units share the same module end date', () => {
    const courses = withEffectiveCourseDates([
      {
        id: 'uc-1',
        name: 'UC 1',
        category: 'Senai > Escola A > Curso X > Turma 1',
        start_date: '2026-01-10T00:00:00.000Z',
        end_date: '2026-12-20T00:00:00.000Z',
      },
      {
        id: 'uc-2',
        name: 'UC 2',
        category: 'Senai > Escola A > Curso X > Turma 1',
        start_date: '2026-03-15T00:00:00.000Z',
        end_date: '2026-12-20T00:00:00.000Z',
      },
      {
        id: 'uc-3',
        name: 'UC 3',
        category: 'Senai > Escola A > Curso X > Turma 1',
        start_date: '2026-05-20T00:00:00.000Z',
        end_date: '2026-12-20T00:00:00.000Z',
      },
    ]);

    expect(courses.map(course => course.effective_end_date)).toEqual([
      '2026-03-15T00:00:00.000Z',
      '2026-05-20T00:00:00.000Z',
      '2026-12-20T00:00:00.000Z',
    ]);
  });

  it('groups uc paths that include the unit name under the same class timeline', () => {
    const courses = withEffectiveCourseDates([
      {
        id: 'uc-1',
        category: 'Senai > Escola A > Curso X > Turma 1 > UC 1',
        start_date: '2026-01-10T00:00:00.000Z',
        end_date: '2026-12-20T00:00:00.000Z',
      },
      {
        id: 'uc-2',
        category: 'Senai > Escola A > Curso X > Turma 1 > UC 2',
        start_date: '2026-03-15T00:00:00.000Z',
        end_date: '2026-12-20T00:00:00.000Z',
      },
    ]);

    expect(courses[0].effective_end_date).toBe('2026-03-15T00:00:00.000Z');
    expect(courses[1].effective_end_date).toBe('2026-12-20T00:00:00.000Z');
  });

  it('keeps inferring sequence even when one unit has divergent module end date', () => {
    const courses = withEffectiveCourseDates([
      {
        id: 'uc-1',
        category: 'Senai > Escola A > Curso X > Turma 3',
        start_date: '2026-01-10T00:00:00.000Z',
        end_date: '2026-12-20T00:00:00.000Z',
      },
      {
        id: 'uc-2',
        category: 'Senai > Escola A > Curso X > Turma 3',
        start_date: '2026-03-15T00:00:00.000Z',
        end_date: '2025-12-20T00:00:00.000Z',
      },
      {
        id: 'uc-3',
        category: 'Senai > Escola A > Curso X > Turma 3',
        start_date: '2026-05-20T00:00:00.000Z',
        end_date: '2026-12-20T00:00:00.000Z',
      },
    ]);

    expect(courses.map(course => course.effective_end_date)).toEqual([
      '2026-03-15T00:00:00.000Z',
      '2026-05-20T00:00:00.000Z',
      '2026-12-20T00:00:00.000Z',
    ]);
  });

  it('falls back to the next start date when the current unit has no declared end date', () => {
    const courses = withEffectiveCourseDates([
      {
        id: 'uc-1',
        category: 'Senai > Escola A > Curso X > Turma 1',
        start_date: '2026-01-10T00:00:00.000Z',
        end_date: null,
      },
      {
        id: 'uc-2',
        category: 'Senai > Escola A > Curso X > Turma 1',
        start_date: '2026-03-15T00:00:00.000Z',
        end_date: '2026-05-20T00:00:00.000Z',
      },
    ]);

    expect(courses[0].effective_end_date).toBe('2026-03-15T00:00:00.000Z');
    expect(courses[1].effective_end_date).toBe('2026-05-20T00:00:00.000Z');
  });

  it('does not infer dates across unrelated uncategorized courses', () => {
    const courses = withEffectiveCourseDates([
      {
        id: 'course-1',
        category: null,
        start_date: '2026-01-10T00:00:00.000Z',
        end_date: null,
      },
      {
        id: 'course-2',
        category: null,
        start_date: '2026-03-15T00:00:00.000Z',
        end_date: '2026-05-20T00:00:00.000Z',
      },
    ]);

    expect(courses[0].effective_end_date).toBeNull();
    expect(courses[1].effective_end_date).toBe('2026-05-20T00:00:00.000Z');
  });
});

describe('course lifecycle helpers', () => {
  it('uses the effective end date when checking if a course is active', () => {
    const course = {
      id: 'uc-1',
      end_date: '2026-12-20T00:00:00.000Z',
      effective_end_date: '2026-03-15T00:00:00.000Z',
    };

    expect(getCourseEffectiveEndDate(course)).toBe('2026-03-15T00:00:00.000Z');
    expect(isCourseEffectivelyActive(course, new Date('2026-03-01T00:00:00.000Z'))).toBe(true);
    expect(isCourseEffectivelyActive(course, new Date('2026-04-01T00:00:00.000Z'))).toBe(false);
  });

  it('resolves lifecycle status with inferred dates', () => {
    const course = {
      id: 'uc-1',
      start_date: '2026-01-10T00:00:00.000Z',
      effective_end_date: '2026-03-15T00:00:00.000Z',
    };

    expect(getCourseLifecycleStatus(course, new Date('2026-01-01T00:00:00.000Z'))).toBe('nao_iniciada');
    expect(getCourseLifecycleStatus(course, new Date('2026-02-01T00:00:00.000Z'))).toBe('em_andamento');
    expect(getCourseLifecycleStatus(course, new Date('2026-04-01T00:00:00.000Z'))).toBe('finalizada');
  });
});
