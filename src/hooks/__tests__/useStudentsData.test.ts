import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useStudentsData } from '@/features/students/hooks/useStudentsData';
import type { StudentListItem, StudentListPage } from '@/features/students/types';
import { createQueryClientWrapper } from '@/test/query-client';

const { listStudentsMock, useAuthMock } = vi.hoisted(() => ({
  listStudentsMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/features/students/api/students', () => ({
  listStudents: (...args: unknown[]) => listStudentsMock(...args),
}));

const studentsItems: StudentListItem[] = [
  {
    avatarUrl: null,
    email: null,
    enrollmentStatus: 'suspenso',
    id: 's-2',
    lastAccessAt: null,
    name: 'Bruno',
    riskLevel: 'critico',
  },
  {
    avatarUrl: null,
    email: null,
    enrollmentStatus: 'ativo',
    id: 's-1',
    lastAccessAt: null,
    name: 'Ana',
    riskLevel: 'atencao',
  },
  {
    avatarUrl: null,
    email: null,
    enrollmentStatus: 'concluido',
    id: 's-3',
    lastAccessAt: null,
    name: 'Carla',
    riskLevel: 'normal',
  },
];

const studentsResponse: StudentListPage = {
  items: studentsItems,
  metadata: {
    contractVersion: 1,
    generatedAt: '2026-02-21T00:00:00.000Z',
  },
  page: 1,
  pageSize: 30,
  totalCount: studentsItems.length,
  totalPages: 1,
};

describe('useStudentsData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: 'user-1' } });
    listStudentsMock.mockResolvedValue(studentsResponse);
  });

  it('loads students for the authenticated user', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentsData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.students).toEqual(studentsItems);
    expect(result.current.totalCount).toBe(studentsItems.length);
    expect(listStudentsMock).toHaveBeenCalledWith({
      courseId: undefined,
      enrollmentStatus: undefined,
      page: 1,
      pageSize: 30,
      riskLevel: undefined,
      search: undefined,
    }, expect.any(AbortSignal));
  });

  it('returns empty data when user is not authenticated', async () => {
    useAuthMock.mockReturnValue({ user: null });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentsData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.students).toEqual([]);
    expect(result.current.totalCount).toBe(0);
    expect(listStudentsMock).not.toHaveBeenCalled();
  });

  it('stores an error when loading students fails', async () => {
    listStudentsMock.mockRejectedValueOnce(new Error('students query failed'));

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentsData(), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toContain('students query failed');
    });
  });

  it('applies explicit course filter when provided', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentsData({ courseId: 'course-fixed' }), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(listStudentsMock).toHaveBeenCalledWith({
      courseId: 'course-fixed',
      enrollmentStatus: undefined,
      page: 1,
      pageSize: 30,
      riskLevel: undefined,
      search: undefined,
    }, expect.any(AbortSignal));
  });
});
