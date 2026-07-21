import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAllCoursesData } from '@/features/courses/hooks/useAllCoursesData';
import { createQueryClientWrapper } from '@/test/query-client';

const useAuthMock = vi.fn();
const listCatalogCoursesMock = vi.fn();
const setCourseAssociationRoleMock = vi.fn();
const setCoursesIgnoredMock = vi.fn();
const setCourseAttendanceEnabledMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/features/courses/api/courses-catalog', () => ({
  listCatalogCourses: (...args: unknown[]) => listCatalogCoursesMock(...args),
  setCourseAssociationRole: (...args: unknown[]) => setCourseAssociationRoleMock(...args),
  setCoursesIgnored: (...args: unknown[]) => setCoursesIgnoredMock(...args),
  setCourseAttendanceEnabled: (...args: unknown[]) => setCourseAttendanceEnabledMock(...args),
}));

const baseCourses = [
  {
    id: 'c-1',
    moodle_course_id: '10',
    name: 'Matematica',
    short_name: 'MAT',
    created_at: '2026-02-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
    students_count: 3,
    at_risk_count: 2,
    is_following: true,
    is_ignored: false,
    is_attendance_enabled: false,
    student_ids: ['s-1', 's-2', 's-3'],
  },
  {
    id: 'c-2',
    moodle_course_id: '20',
    name: 'Historia',
    short_name: 'HIS',
    created_at: '2026-02-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
    students_count: 1,
    at_risk_count: 0,
    is_following: false,
    is_ignored: true,
    is_attendance_enabled: true,
    student_ids: ['s-4'],
  },
];

describe('useAllCoursesData', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: 'user-1' } });
    listCatalogCoursesMock.mockResolvedValue(baseCourses);
    setCourseAssociationRoleMock.mockResolvedValue(undefined);
    setCoursesIgnoredMock.mockResolvedValue(undefined);
    setCourseAttendanceEnabledMock.mockResolvedValue(undefined);
  });

  it('loads all courses with stats and flags', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useAllCoursesData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.courses).toHaveLength(2);
    expect(result.current.courses[0]).toMatchObject({
      id: 'c-1',
      students_count: 3,
      at_risk_count: 2,
      is_following: true,
      is_ignored: false,
      is_attendance_enabled: false,
    });
    expect(result.current.courses[1]).toMatchObject({
      id: 'c-2',
      students_count: 1,
      at_risk_count: 0,
      is_following: false,
      is_ignored: true,
      is_attendance_enabled: true,
    });
  });

  it('toggles follow and switches association role', async () => {
    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useAllCoursesData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggleFollow('c-2');
    });

    expect(setCourseAssociationRoleMock).toHaveBeenCalledWith(['c-2'], 'tutor');
    await waitFor(() => {
      expect(result.current.courses.find((course) => course.id === 'c-2')?.is_following).toBe(true);
    });

    await act(async () => {
      await result.current.toggleFollow('c-1');
    });

    expect(setCourseAssociationRoleMock).toHaveBeenCalledWith(['c-1'], 'viewer');
    await waitFor(() => {
      expect(result.current.courses.find((course) => course.id === 'c-1')?.is_following).toBe(false);
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['students', 'user-1'] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['dashboard', 'user-1'] });
  });

  it('toggles ignore for a single course', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useAllCoursesData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggleIgnore('c-1');
    });

    expect(setCoursesIgnoredMock).toHaveBeenCalledWith(['c-1'], true);
    await waitFor(() => {
      expect(result.current.courses.find((course) => course.id === 'c-1')?.is_ignored).toBe(true);
    });

    await act(async () => {
      await result.current.toggleIgnore('c-2');
    });

    expect(setCoursesIgnoredMock).toHaveBeenCalledWith(['c-2'], false);
    await waitFor(() => {
      expect(result.current.courses.find((course) => course.id === 'c-2')?.is_ignored).toBe(false);
    });
  });

  it('toggles ignore for multiple courses without duplicating existing ignored ones', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useAllCoursesData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggleIgnoreMultiple(['c-1', 'c-2'], true);
    });

    expect(setCoursesIgnoredMock).toHaveBeenCalledWith(['c-1'], true);
    await waitFor(() => {
      expect(result.current.courses.every((course) => course.is_ignored)).toBe(true);
    });

    await act(async () => {
      await result.current.toggleIgnoreMultiple(['c-1', 'c-2'], false);
    });

    expect(setCoursesIgnoredMock).toHaveBeenCalledWith(['c-1', 'c-2'], false);
    await waitFor(() => {
      expect(result.current.courses.every((course) => !course.is_ignored)).toBe(true);
    });
  });

  it('updates the catalog only after a bulk command with more than 200 courses finishes', async () => {
    const bulkCourses = Array.from({ length: 205 }, (_, index) => ({
      ...baseCourses[0],
      id: `c-${index + 1}`,
      moodle_course_id: String(index + 1),
      is_ignored: false,
    }));
    const courseIds = bulkCourses.map((course) => course.id);
    listCatalogCoursesMock.mockResolvedValue(bulkCourses);

    let resolveCommand!: () => void;
    setCoursesIgnoredMock.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveCommand = resolve;
    }));

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useAllCoursesData(), { wrapper });

    await waitFor(() => {
      expect(result.current.courses).toHaveLength(205);
    });

    let mutationPromise!: Promise<void>;
    act(() => {
      mutationPromise = result.current.toggleIgnoreMultiple(courseIds, true);
    });

    await waitFor(() => {
      expect(setCoursesIgnoredMock).toHaveBeenCalledWith(courseIds, true);
    });
    expect(result.current.courses.every((course) => !course.is_ignored)).toBe(true);

    resolveCommand();
    await act(async () => mutationPromise);

    await waitFor(() => {
      expect(result.current.courses.every((course) => course.is_ignored)).toBe(true);
    });
  });

  it('unfollows multiple courses using viewer role', async () => {
    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useAllCoursesData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.unfollowMultiple(['c-1', 'c-2']);
    });

    expect(setCourseAssociationRoleMock).toHaveBeenCalledWith(['c-1', 'c-2'], 'viewer');
    await waitFor(() => {
      expect(result.current.courses.every((course) => !course.is_following)).toBe(true);
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['students', 'user-1'] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['dashboard', 'user-1'] });
  });

  it('toggles attendance for a single course', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useAllCoursesData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggleAttendance('c-1');
    });

    expect(setCourseAttendanceEnabledMock).toHaveBeenCalledWith(['c-1'], true);
    await waitFor(() => {
      expect(result.current.courses.find((course) => course.id === 'c-1')?.is_attendance_enabled).toBe(true);
    });

    await act(async () => {
      await result.current.toggleAttendance('c-2');
    });

    expect(setCourseAttendanceEnabledMock).toHaveBeenCalledWith(['c-2'], false);
    await waitFor(() => {
      expect(result.current.courses.find((course) => course.id === 'c-2')?.is_attendance_enabled).toBe(false);
    });
  });

  it('toggles attendance for multiple courses without duplicating existing settings', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useAllCoursesData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggleAttendanceMultiple(['c-1', 'c-2'], true);
    });

    expect(setCourseAttendanceEnabledMock).toHaveBeenCalledWith(['c-1'], true);
    await waitFor(() => {
      expect(result.current.courses.every((course) => course.is_attendance_enabled)).toBe(true);
    });

    await act(async () => {
      await result.current.toggleAttendanceMultiple(['c-1', 'c-2'], false);
    });

    expect(setCourseAttendanceEnabledMock).toHaveBeenCalledWith(['c-1', 'c-2'], false);
    await waitFor(() => {
      expect(result.current.courses.every((course) => !course.is_attendance_enabled)).toBe(true);
    });
  });

  it('returns empty courses when user is not authenticated', async () => {
    useAuthMock.mockReturnValue({ user: null });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useAllCoursesData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.courses).toEqual([]);
    expect(listCatalogCoursesMock).not.toHaveBeenCalled();
  });
});
