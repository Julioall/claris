import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useCoursesData } from '@/features/courses/hooks/useCoursesData';
import { createQueryClientWrapper } from '@/test/query-client';

const useAuthMock = vi.fn();
const listCatalogCoursesForUserMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/features/courses/api/courses.repository', () => ({
  listCatalogCoursesForUser: (...args: unknown[]) => listCatalogCoursesForUserMock(...args),
}));

describe('useCoursesData', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: 'user-1' } });
    listCatalogCoursesForUserMock.mockResolvedValue([
      {
        id: 'c-1',
        name: 'Matematica',
        short_name: 'MAT',
        moodle_course_id: '10',
        created_at: '2026-02-01T00:00:00.000Z',
        updated_at: '2026-02-01T00:00:00.000Z',
        students_count: 25,
        at_risk_count: 2,
        is_following: true,
        is_ignored: false,
        is_attendance_enabled: false,
        student_ids: ['s-1', 's-2'],
      },
      {
        id: 'c-2',
        name: 'Historia',
        short_name: 'HIS',
        moodle_course_id: '20',
        created_at: '2026-02-01T00:00:00.000Z',
        updated_at: '2026-02-01T00:00:00.000Z',
        students_count: 10,
        at_risk_count: 0,
        is_following: false,
        is_ignored: false,
        is_attendance_enabled: false,
        student_ids: [],
      },
    ]);
  });

  it('loads only followed courses from the catalog query', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCoursesData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.courses).toEqual([
      expect.objectContaining({
        id: 'c-1',
        name: 'Matematica',
        students_count: 25,
        at_risk_count: 2,
      }),
    ]);
    expect(listCatalogCoursesForUserMock).toHaveBeenCalledWith('user-1');
  });

  it('stores an error when the catalog query fails', async () => {
    listCatalogCoursesForUserMock.mockRejectedValueOnce(new Error('query failed'));

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCoursesData(), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toContain('query failed');
    });
  });

  it('returns immediately when user is not authenticated', async () => {
    useAuthMock.mockReturnValue({ user: null });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCoursesData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.courses).toEqual([]);
    expect(listCatalogCoursesForUserMock).not.toHaveBeenCalled();
  });
});
