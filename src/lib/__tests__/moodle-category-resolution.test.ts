import { describe, expect, it } from 'vitest';
import {
  buildCategoryPath,
  resolveCourseCategoryName,
} from '../../../supabase/functions/_shared/moodle/client.ts';

describe('Moodle category resolution', () => {
  it('returns an empty path when any category ancestor is missing', () => {
    const categories = [
      {
        id: 12,
        name: 'Turma 1',
        parent: 8,
        path: '/1/8/12',
      },
    ];

    expect(buildCategoryPath(12, categories)).toBe('');
  });

  it('preserves the existing hierarchy when the latest category lookup fails', () => {
    expect(
      resolveCourseCategoryName(
        12,
        [],
        'Instituição > Escola A > Curso X > Turma 1',
      ),
    ).toBe('Instituição > Escola A > Curso X > Turma 1');
  });

  it('returns null when there is no valid hierarchy to preserve', () => {
    expect(resolveCourseCategoryName(12, [], '12')).toBeNull();
  });
});
