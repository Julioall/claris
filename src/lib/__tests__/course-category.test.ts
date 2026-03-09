import { describe, expect, it } from 'vitest';
import { buildCourseCategoryFilterOptions, parseCourseCategoryPath } from '@/lib/course-category';

describe('parseCourseCategoryPath', () => {
  it('parses Moodle category paths with institutional root', () => {
    expect(parseCourseCategoryPath('Senai > Escola A > Curso X > Turma 1')).toEqual({
      school: 'Escola A',
      course: 'Curso X',
      className: 'Turma 1',
      uc: '',
    });
  });

  it('keeps uc when the hierarchy includes it', () => {
    expect(parseCourseCategoryPath('Senai > Escola A > Curso X > Turma 1 > UC Z')).toEqual({
      school: 'Escola A',
      course: 'Curso X',
      className: 'Turma 1',
      uc: 'UC Z',
    });
  });

  it('supports slash-separated paths without root level', () => {
    expect(parseCourseCategoryPath('Escola B / Curso Y / Turma 2 / UC W')).toEqual({
      school: 'Escola B',
      course: 'Curso Y',
      className: 'Turma 2',
      uc: 'UC W',
    });
  });

  it('returns empty values when category is missing', () => {
    expect(parseCourseCategoryPath()).toEqual({
      school: '',
      course: '',
      className: '',
      uc: '',
    });
  });
});

describe('buildCourseCategoryFilterOptions', () => {
  const sources = [
    { category: 'Senai > Escola A > Curso X > Turma 1', courseName: 'Disciplina 1' },
    { category: 'Senai > Escola A > Curso X > Turma 2', courseName: 'Disciplina 2' },
    { category: 'Senai > Escola A > Curso Y > Turma 3 > UC Alfa', courseName: 'Disciplina 3' },
    { category: 'Senai > Escola B > Curso Z > Turma 4', courseName: 'Disciplina 4' },
  ];

  it('returns all options when no filter is selected', () => {
    expect(buildCourseCategoryFilterOptions(sources)).toEqual({
      schools: ['Escola A', 'Escola B'],
      courses: ['Curso X', 'Curso Y', 'Curso Z'],
      classes: ['Turma 1', 'Turma 2', 'Turma 3', 'Turma 4'],
      ucs: ['Disciplina 1', 'Disciplina 2', 'Disciplina 4', 'UC Alfa'],
    });
  });

  it('limits courses and classes by selected school', () => {
    expect(buildCourseCategoryFilterOptions(sources, { school: 'Escola A' })).toEqual({
      schools: ['Escola A', 'Escola B'],
      courses: ['Curso X', 'Curso Y'],
      classes: ['Turma 1', 'Turma 2', 'Turma 3'],
      ucs: ['Disciplina 1', 'Disciplina 2', 'UC Alfa'],
    });
  });

  it('limits classes and ucs by selected school and course', () => {
    expect(buildCourseCategoryFilterOptions(sources, { school: 'Escola A', course: 'Curso X' })).toEqual({
      schools: ['Escola A', 'Escola B'],
      courses: ['Curso X', 'Curso Y'],
      classes: ['Turma 1', 'Turma 2'],
      ucs: ['Disciplina 1', 'Disciplina 2'],
    });
  });
});
