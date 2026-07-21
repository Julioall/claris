import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useStudentProfile } from '@/features/students/hooks/useStudentProfile';
import type { StudentProfile } from '@/features/students/types';
import { ApiClientError } from '@/integrations/http/edge-function-client';
import { createQueryClientWrapper } from '@/test/query-client';

const { getStudentProfileMock, useAuthMock } = vi.hoisted(() => ({
  getStudentProfileMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/features/students/api/students', () => ({
  getStudentProfile: (...args: unknown[]) => getStudentProfileMock(...args),
}));

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

const studentProfile: StudentProfile = {
  courses: [],
  metadata: {
    contractVersion: 1,
    dataUpdatedAt: '2026-02-20T00:00:00.000Z',
    generatedAt: '2026-02-21T00:00:00.000Z',
  },
  student: {
    avatarUrl: null,
    city: null,
    createdAt: '2026-02-01T00:00:00.000Z',
    email: 'ana@example.com',
    id: 's-1',
    lastAccessAt: '2026-02-20T00:00:00.000Z',
    mobilePhone: null,
    moodleUserId: '10',
    name: 'Ana Silva',
    phone: null,
    phoneNumber: null,
    riskLevel: 'risco',
    riskReasons: ['falta'],
    tags: ['prioridade'],
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
};

describe('useStudentProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: 'user-1' } });
    getStudentProfileMock.mockResolvedValue(studentProfile);
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it('loads student profile through the backend API', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentProfile('s-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.student).toMatchObject({
      id: 's-1',
      riskLevel: 'risco',
    });
    expect(getStudentProfileMock).toHaveBeenCalledWith('s-1', expect.any(AbortSignal));
  });

  it('returns early when student id is missing', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentProfile(undefined), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(getStudentProfileMock).not.toHaveBeenCalled();
    expect(result.current.student).toBeNull();
  });

  it('returns early when user is not authenticated', async () => {
    useAuthMock.mockReturnValue({ user: null });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentProfile('s-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(getStudentProfileMock).not.toHaveBeenCalled();
    expect(result.current.student).toBeNull();
  });

  it('sets not-found message when the backend hides an inaccessible student', async () => {
    getStudentProfileMock.mockRejectedValueOnce(new ApiClientError({
      code: 'not_found',
      message: 'Student not found.',
      status: 404,
    }));

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentProfile('unknown'), { wrapper });

    await waitFor(() => {
      expect(result.current.error?.toLowerCase()).toMatch(/n.o encontrado/);
    });

    expect(result.current.student).toBeNull();
  });

  it('handles backend errors', async () => {
    getStudentProfileMock.mockRejectedValueOnce(new Error('fetch failed'));

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentProfile('s-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toBe('fetch failed');
    });
  });

  it('supports explicit refetch', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStudentProfile('s-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(getStudentProfileMock).toHaveBeenCalledTimes(2);
  });
});
