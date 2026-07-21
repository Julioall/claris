import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseCourseAttendancePayload } from '../../../../supabase/functions/course-attendance/payload.ts';
import type { CourseAttendanceRepository } from '../../../../supabase/functions/course-attendance/repository.ts';
import {
  getCourseAttendanceOverview,
  saveCourseAttendanceSheet,
} from '../../../../supabase/functions/course-attendance/service.ts';

const courseId = '11111111-1111-4111-8111-111111111111';
const studentId = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-07-21T15:00:00.000Z');

function createRepository(): CourseAttendanceRepository {
  return {
    listDateSummaries: vi.fn(async () => []),
    listHistory: vi.fn(async () => []),
    listSheet: vi.fn(async () => []),
    listStudents: vi.fn(async () => []),
    saveSheet: vi.fn(async ({ entries }) => entries.length),
    userCanAccessCourse: vi.fn(async () => true),
    userCanManageAttendance: vi.fn(async () => true),
    userCanViewPanel: vi.fn(async () => true),
  };
}

describe('course-attendance HTTP contract', () => {
  let repository: CourseAttendanceRepository;

  beforeEach(() => {
    repository = createRepository();
  });

  it('accepts versioned use-case payloads without browser identity', () => {
    expect(parseCourseAttendancePayload({
      action: 'get_overview',
      courseId,
    })).toEqual({ action: 'get_overview', courseId, limit: 120, offset: 0 });

    expect(parseCourseAttendancePayload({
      action: 'get_sheet',
      courseId,
      date: '2026-07-21',
    })).toEqual({ action: 'get_sheet', courseId, date: '2026-07-21' });

    expect(parseCourseAttendancePayload({
      action: 'save_sheet',
      courseId,
      date: '2026-07-21',
      entries: [{ studentId, status: 'presente', notes: 'Participou' }],
    })).toEqual({
      action: 'save_sheet',
      courseId,
      date: '2026-07-21',
      entries: [{ studentId, status: 'presente', notes: 'Participou' }],
    });
  });

  it.each([
    {},
    { action: 'get_overview', courseId, userId: 'spoofed' },
    { action: 'get_overview', courseId: 'invalid' },
    { action: 'get_overview', courseId, limit: 0 },
    { action: 'get_sheet', courseId, date: '2026-02-30' },
    {
      action: 'save_sheet',
      courseId,
      date: '2026-07-21',
      entries: [{ studentId, status: 'unknown' }],
    },
    {
      action: 'save_sheet',
      courseId,
      date: '2026-07-21',
      entries: [
        { studentId, status: 'presente' },
        { studentId, status: 'ausente' },
      ],
    },
  ])('rejects invalid fields, identity and unsafe sheets: %o', (payload) => {
    expect(() => parseCourseAttendancePayload(payload)).toThrowError(
      expect.objectContaining({ status: 422 }),
    );
  });

  it('derives actor scope and returns a limited camelCase overview', async () => {
    vi.mocked(repository.listHistory).mockResolvedValue([
      {
        date: '2026-07-21',
        id: 'record-1',
        notes: null,
        status: 'presente',
        studentId,
        studentName: 'Ana',
        updatedAt: '2026-07-21T14:00:00.000Z',
      },
      {
        date: '2026-07-20',
        id: 'record-2',
        notes: null,
        status: 'ausente',
        studentId,
        studentName: 'Ana',
        updatedAt: '2026-07-20T14:00:00.000Z',
      },
    ]);
    vi.mocked(repository.listStudents).mockResolvedValue([
      { email: 'ana@example.com', id: studentId, name: 'Ana' },
    ]);
    vi.mocked(repository.listDateSummaries).mockResolvedValue([
      { ausente: 100, date: '2026-07-21', justificado: 100, presente: 100, total: 300 },
    ]);

    const result = await getCourseAttendanceOverview(repository, 'authenticated-user', {
      action: 'get_overview',
      courseId,
      limit: 1,
      offset: 0,
    }, now);

    expect(repository.userCanAccessCourse).toHaveBeenCalledWith('authenticated-user', courseId);
    expect(repository.listHistory).toHaveBeenCalledWith({
      courseId,
      limit: 1,
      offset: 0,
      userId: 'authenticated-user',
    });
    expect(result).toMatchObject({
      dateSummaries: [{ date: '2026-07-21', total: 300 }],
      metadata: { contractVersion: 1, hasMore: true, limit: 1, offset: 0 },
      records: [{ student: { id: studentId, name: 'Ana' } }],
      students: [{ id: studentId, name: 'Ana' }],
    });
  });

  it('rejects a course outside the authenticated actor scope before querying data', async () => {
    vi.mocked(repository.userCanAccessCourse).mockResolvedValue(false);

    await expect(getCourseAttendanceOverview(repository, 'authenticated-user', {
      action: 'get_overview',
      courseId,
      limit: 120,
      offset: 0,
    }, now)).rejects.toMatchObject({ code: 'forbidden', status: 403 });

    expect(repository.listHistory).not.toHaveBeenCalled();
    expect(repository.listDateSummaries).not.toHaveBeenCalled();
    expect(repository.listStudents).not.toHaveBeenCalled();
  });

  it('saves the complete validated batch under the authenticated actor', async () => {
    const result = await saveCourseAttendanceSheet(repository, 'authenticated-user', {
      action: 'save_sheet',
      courseId,
      date: '2026-07-21',
      entries: [{ studentId, status: 'justificado', notes: null }],
    }, now);

    expect(repository.saveSheet).toHaveBeenCalledWith({
      courseId,
      date: '2026-07-21',
      entries: [{ studentId, status: 'justificado', notes: null }],
      userId: 'authenticated-user',
    });
    expect(result.savedCount).toBe(1);
    expect(result.metadata.contractVersion).toBe(1);
  });

  it.each([
    ['P0001', 409, 'conflict'],
    ['P0002', 422, 'validation_failed'],
    ['22023', 422, 'validation_failed'],
    ['42501', 403, 'forbidden'],
  ])('maps expected transactional database error %s to the API contract', async (code, status, apiCode) => {
    vi.mocked(repository.saveSheet).mockRejectedValue({ code });

    await expect(saveCourseAttendanceSheet(repository, 'authenticated-user', {
      action: 'save_sheet',
      courseId,
      date: '2026-07-21',
      entries: [{ studentId, status: 'presente', notes: null }],
    }, now)).rejects.toMatchObject({ code: apiCode, status });
  });
});
