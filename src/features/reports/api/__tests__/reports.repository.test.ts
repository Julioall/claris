import { describe, expect, it, vi } from 'vitest';

import { fetchTutorCourses } from '@/features/reports/api';

const listCatalogCoursesForUserMock = vi.fn();

vi.mock('@/features/courses/api/courses.repository', () => ({
  listCatalogCoursesForUser: (...args: unknown[]) => listCatalogCoursesForUserMock(...args),
}));

describe('reports api', () => {
  it('lists only courses followed in My Courses for report selection', async () => {
    listCatalogCoursesForUserMock.mockResolvedValueOnce([
      {
        id: 'course-unfollowed',
        name: 'Z Curso fora de meus cursos',
        short_name: 'FORA',
        category: 'Categoria nao favoritada',
        start_date: null,
        end_date: null,
        is_following: false,
      },
      {
        id: 'course-2',
        name: 'Biologia',
        short_name: 'BIO',
        category: 'Curso B',
        start_date: '2026-02-01T00:00:00.000Z',
        end_date: '2026-03-01T00:00:00.000Z',
        is_following: true,
      },
      {
        id: 'course-1',
        name: 'Artes',
        short_name: 'ART',
        category: 'Curso A',
        start_date: '2026-01-01T00:00:00.000Z',
        end_date: '2026-02-01T00:00:00.000Z',
        is_following: true,
      },
    ]);

    await expect(fetchTutorCourses('user-1')).resolves.toEqual([
      {
        id: 'course-1',
        name: 'Artes',
        short_name: 'ART',
        category: 'Curso A',
        start_date: '2026-01-01T00:00:00.000Z',
        end_date: '2026-02-01T00:00:00.000Z',
      },
      {
        id: 'course-2',
        name: 'Biologia',
        short_name: 'BIO',
        category: 'Curso B',
        start_date: '2026-02-01T00:00:00.000Z',
        end_date: '2026-03-01T00:00:00.000Z',
      },
    ]);
    expect(listCatalogCoursesForUserMock).toHaveBeenCalledWith('user-1');
  });
});
