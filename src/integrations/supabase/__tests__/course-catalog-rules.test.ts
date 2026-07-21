import { describe, expect, it } from 'vitest';

import {
  allowedPermissionsForCourseCatalogAction,
  canExecuteCourseCatalogAction,
  getCourseCatalogLifecycleStatus,
  withEffectiveCourseCatalogDates,
} from '../../../../supabase/functions/courses-catalog/rules.ts';

describe('courses-catalog domain rules', () => {
  it('preserves the route permission matrix with explicit permissions per action', () => {
    expect(allowedPermissionsForCourseCatalogAction('get_catalog')).toEqual([
      'courses.catalog.view',
      'schools.view',
      'reports.view',
    ]);
    expect(allowedPermissionsForCourseCatalogAction('set_association_role')).toEqual([
      'courses.catalog.view',
      'schools.view',
    ]);
    expect(allowedPermissionsForCourseCatalogAction('set_ignored')).toEqual([
      'courses.catalog.view',
      'schools.view',
    ]);
    expect(allowedPermissionsForCourseCatalogAction('set_attendance_enabled')).toEqual([
      'courses.attendance.manage',
    ]);
  });

  it.each([
    ['get_catalog', 'schools.view', true],
    ['get_catalog', 'reports.view', true],
    ['set_association_role', 'schools.view', true],
    ['set_ignored', 'schools.view', true],
    ['set_attendance_enabled', 'reports.view', false],
    ['set_association_role', 'reports.view', false],
  ] as const)('authorizes %s with %s: %s', async (action, grantedPermission, expected) => {
    await expect(canExecuteCourseCatalogAction(
      action,
      async (permission) => permission === grantedPermission,
    )).resolves.toBe(expected);
  });

  it('uses the next unit start when a class timeline shares its module end date', () => {
    const courses = withEffectiveCourseCatalogDates([
      {
        category: 'Senai > Escola A > Curso X > Turma 1 > UC 1',
        endsAt: '2026-12-20T00:00:00.000Z',
        id: 'uc-1',
        startsAt: '2026-01-10T00:00:00.000Z',
      },
      {
        category: 'Senai > Escola A > Curso X > Turma 1 > UC 2',
        endsAt: '2026-12-20T00:00:00.000Z',
        id: 'uc-2',
        startsAt: '2026-03-15T00:00:00.000Z',
      },
    ]);

    expect(courses.map(({ effectiveEndsAt }) => effectiveEndsAt)).toEqual([
      '2026-03-15T00:00:00.000Z',
      '2026-12-20T00:00:00.000Z',
    ]);
  });

  it('does not infer effective dates between unrelated uncategorized courses', () => {
    const courses = withEffectiveCourseCatalogDates([
      { category: null, endsAt: null, id: 'course-1', startsAt: '2026-01-01T00:00:00.000Z' },
      {
        category: null,
        endsAt: '2026-12-20T00:00:00.000Z',
        id: 'course-2',
        startsAt: '2026-02-01T00:00:00.000Z',
      },
    ]);

    expect(courses[0].effectiveEndsAt).toBeNull();
    expect(courses[1].effectiveEndsAt).toBe('2026-12-20T00:00:00.000Z');
  });

  it('calculates lifecycle from effective dates on the backend', () => {
    const referenceDate = new Date('2026-04-01T00:00:00.000Z');

    expect(getCourseCatalogLifecycleStatus({
      effectiveEndsAt: '2026-03-15T00:00:00.000Z',
      endsAt: '2026-12-20T00:00:00.000Z',
      startsAt: '2026-01-10T00:00:00.000Z',
    }, referenceDate)).toBe('finalizada');
    expect(getCourseCatalogLifecycleStatus({
      effectiveEndsAt: '2026-12-20T00:00:00.000Z',
      endsAt: '2026-12-20T00:00:00.000Z',
      startsAt: '2026-05-10T00:00:00.000Z',
    }, referenceDate)).toBe('nao_iniciada');
    expect(getCourseCatalogLifecycleStatus({
      effectiveEndsAt: null,
      endsAt: null,
      startsAt: '2026-01-10T00:00:00.000Z',
    }, referenceDate)).toBe('em_andamento');
  });
});
