import { describe, expect, it } from 'vitest';

import {
  filterInProgressCourses,
  getCourseLifecycleStatus,
  withEffectiveCourseDates,
} from '../../../supabase/functions/_shared/claris/suggestion-course-scope.ts';

describe('suggestion course scope', () => {
  it('keeps only courses that are currently em andamento', () => {
    const referenceDate = new Date('2026-03-27T12:00:00.000Z');

    const courses = filterInProgressCourses(
      [
        {
          id: 'in-progress',
          name: 'Turma em andamento',
          category: 'Escola > Curso > Turma A > UC 1',
          start_date: '2026-03-01T00:00:00.000Z',
          end_date: '2026-04-30T00:00:00.000Z',
        },
        {
          id: 'not-started',
          name: 'Turma não iniciada',
          category: 'Escola > Curso > Turma B > UC 1',
          start_date: '2026-04-10T00:00:00.000Z',
          end_date: '2026-05-30T00:00:00.000Z',
        },
        {
          id: 'finished',
          name: 'Turma finalizada',
          category: 'Escola > Curso > Turma C > UC 1',
          start_date: '2026-01-10T00:00:00.000Z',
          end_date: '2026-02-10T00:00:00.000Z',
        },
      ],
      referenceDate,
    );

    expect(courses.map((course) => course.id)).toEqual(['in-progress']);
    expect(getCourseLifecycleStatus(courses[0], referenceDate)).toBe('em_andamento');
  });

  it('uses effective end dates to ignore finished modules in the same turma', () => {
    const referenceDate = new Date('2026-04-01T00:00:00.000Z');

    const courses = withEffectiveCourseDates([
      {
        id: 'uc-1',
        name: 'UC 1',
        category: 'Rede > Escola > Curso > Turma A',
        start_date: '2026-01-10T00:00:00.000Z',
        end_date: '2026-12-20T00:00:00.000Z',
      },
      {
        id: 'uc-2',
        name: 'UC 2',
        category: 'Rede > Escola > Curso > Turma A',
        start_date: '2026-03-15T00:00:00.000Z',
        end_date: '2026-12-20T00:00:00.000Z',
      },
      {
        id: 'uc-3',
        name: 'UC 3',
        category: 'Rede > Escola > Curso > Turma A',
        start_date: '2026-05-20T00:00:00.000Z',
        end_date: '2026-12-20T00:00:00.000Z',
      },
    ]);

    expect(courses.map((course) => course.effective_end_date)).toEqual([
      '2026-03-15T00:00:00.000Z',
      '2026-05-20T00:00:00.000Z',
      '2026-12-20T00:00:00.000Z',
    ]);

    const inProgress = filterInProgressCourses(courses, referenceDate);
    expect(inProgress.map((course) => course.id)).toEqual(['uc-2']);
  });
});
