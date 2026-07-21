import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeEdgeFunctionMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    readonly code: string;

    constructor(error: { code: string; message: string }) {
      super(error.message);
      this.code = error.code;
    }
  },
  invokeEdgeFunction: invokeEdgeFunctionMock,
}));

import {
  getStudentHistory,
  getStudentProfile,
  listStudents,
} from '../students';

const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const metadata = { contractVersion: 1, generatedAt: '2026-07-21T12:00:00.000Z' };

describe('students API client', () => {
  beforeEach(() => {
    invokeEdgeFunctionMock.mockReset();
  });

  it('lists students with normalized filters and never sends actor identity', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      items: [{
        avatarUrl: null,
        email: 'ana@example.com',
        enrollmentStatus: 'ativo',
        id: STUDENT_ID,
        lastAccessAt: null,
        name: 'Ana',
        riskLevel: 'atencao',
      }],
      metadata,
      page: 2,
      pageSize: 20,
      totalCount: 21,
      totalPages: 2,
    });
    const controller = new AbortController();

    const result = await listStudents({ page: 2, pageSize: 20, search: ' Ana ' }, controller.signal);
    expect(result.items[0].name).toBe('Ana');
    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('students', {
      auth: 'required',
      body: {
        action: 'list_students',
        filters: { search: 'Ana' },
        page: 2,
        pageSize: 20,
      },
      signal: controller.signal,
      timeoutMs: 20_000,
    });
    expect(invokeEdgeFunctionMock.mock.calls[0][1].body).not.toHaveProperty('userId');
  });

  it('loads a profile and maps only the stable view model', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      courses: [],
      metadata: { ...metadata, dataUpdatedAt: null },
      student: {
        avatarUrl: null, city: null, createdAt: null, email: null, id: STUDENT_ID,
        lastAccessAt: null, mobilePhone: null, moodleUserId: '123', name: 'Ana',
        phone: null, phoneNumber: null, riskLevel: 'normal', riskReasons: [], tags: [], updatedAt: null,
      },
    });

    await expect(getStudentProfile(STUDENT_ID)).resolves.toMatchObject({
      student: { id: STUDENT_ID, name: 'Ana' },
      courses: [],
    });
    expect(invokeEdgeFunctionMock.mock.calls[0][1].body).toEqual({
      action: 'get_profile',
      studentId: STUDENT_ID,
    });
  });

  it('loads history using the authenticated cache-independent contract', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      items: [],
      metadata: { ...metadata, dataUpdatedAt: null },
    });

    await expect(getStudentHistory(STUDENT_ID)).resolves.toMatchObject({ items: [] });
    expect(invokeEdgeFunctionMock.mock.calls[0][1].body).toEqual({
      action: 'get_history',
      studentId: STUDENT_ID,
    });
  });

  it('rejects snake_case or inconsistent pagination responses', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      items: [{ id: STUDENT_ID, full_name: 'Ana' }],
      metadata,
      page: 1,
      pageSize: 30,
      totalCount: 1,
      totalPages: 1,
    });
    await expect(listStudents()).rejects.toMatchObject({ code: 'invalid_response' });

    invokeEdgeFunctionMock.mockResolvedValueOnce({
      items: [], metadata, page: 1, pageSize: 30, totalCount: 31, totalPages: 1,
    });
    await expect(listStudents()).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
