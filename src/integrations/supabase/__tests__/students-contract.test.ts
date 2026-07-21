import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseStudentsPayload } from '../../../../supabase/functions/students/payload.ts';
import type {
  StudentProfileRecord,
  StudentsRepository,
} from '../../../../supabase/functions/students/repository.ts';
import {
  authorizeStudentsAction,
  getStudentProfile,
  listStudents,
} from '../../../../supabase/functions/students/service.ts';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

const student: StudentProfileRecord = {
  avatarUrl: null,
  city: 'Goiania',
  createdAt: '2026-01-01T00:00:00.000Z',
  email: 'ana@example.com',
  id: STUDENT_ID,
  lastAccessAt: '2026-07-20T00:00:00.000Z',
  mobilePhone: null,
  moodleUserId: '123',
  name: 'Ana',
  phone: null,
  phoneNumber: null,
  riskLevel: 'atencao',
  riskReasons: ['Sem acesso recente'],
  tags: ['acompanhamento'],
  updatedAt: '2026-07-20T00:00:00.000Z',
};

function createRepository(): StudentsRepository {
  return {
    findStudent: vi.fn(async () => student),
    listActivities: vi.fn(async () => []),
    listCourses: vi.fn(async () => [{
      endAt: null,
      id: COURSE_ID,
      name: 'Matematica',
      shortName: 'MAT',
      startAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-07-19T00:00:00.000Z',
    }]),
    listGrades: vi.fn(async () => [{
      courseId: COURSE_ID,
      formatted: '8,0',
      id: 'grade-1',
      lastSyncedAt: '2026-07-20T00:00:00.000Z',
      letter: null,
      maximum: 10,
      percentage: 80,
      raw: 8,
      updatedAt: '2026-07-20T00:00:00.000Z',
    }]),
    listSnapshots: vi.fn(async () => []),
    listStudentCourseIds: vi.fn(async () => [COURSE_ID]),
    listStudentsPage: vi.fn(async () => ({
      items: [{
        avatarUrl: null,
        email: student.email,
        enrollmentStatus: 'ativo',
        id: STUDENT_ID,
        lastAccessAt: student.lastAccessAt,
        name: student.name,
        riskLevel: student.riskLevel,
      }],
      totalCount: 1,
    })),
    userCanAccessStudent: vi.fn(async () => true),
    userHasPermission: vi.fn(async () => true),
  };
}

describe('students V1 contract', () => {
  let repository: StudentsRepository;

  beforeEach(() => {
    repository = createRepository();
  });

  it('accepts strict use-case payloads without browser identity', () => {
    expect(parseStudentsPayload({
      action: 'list_students',
      filters: { courseId: COURSE_ID, riskLevel: 'atencao', search: ' Ana ' },
      page: 2,
      pageSize: 25,
    })).toEqual({
      action: 'list_students',
      filters: { courseId: COURSE_ID, riskLevel: 'atencao', search: 'Ana' },
      page: 2,
      pageSize: 25,
    });
    expect(parseStudentsPayload({ action: 'get_profile', studentId: STUDENT_ID })).toEqual({
      action: 'get_profile',
      studentId: STUDENT_ID,
    });
    expect(parseStudentsPayload({ action: 'get_history', studentId: STUDENT_ID })).toEqual({
      action: 'get_history',
      studentId: STUDENT_ID,
    });
  });

  it.each([
    {},
    { action: 'list_students', page: 0 },
    { action: 'list_students', pageSize: 101 },
    { action: 'list_students', filters: { riskLevel: 'unknown' } },
    { action: 'list_students', filters: {}, userId: USER_ID },
    { action: 'get_profile', studentId: 'invalid' },
    { action: 'get_history', studentId: STUDENT_ID, user_id: USER_ID },
  ])('rejects malformed, extra or identity fields: %o', (payload) => {
    expect(() => parseStudentsPayload(payload)).toThrowError(
      expect.objectContaining({ status: 422 }),
    );
  });

  it('requires students.view for every action', async () => {
    const payload = parseStudentsPayload({ action: 'get_profile', studentId: STUDENT_ID });
    await expect(authorizeStudentsAction(repository, USER_ID, payload)).resolves.toBe(true);
    expect(repository.userHasPermission).toHaveBeenCalledWith(USER_ID, 'students.view');

    vi.mocked(repository.userHasPermission).mockResolvedValue(false);
    await expect(authorizeStudentsAction(repository, USER_ID, payload)).resolves.toBe(false);
  });

  it('derives actor scope and preserves page totals even outside the last page', async () => {
    vi.mocked(repository.listStudentsPage).mockResolvedValue({ items: [], totalCount: 31 });
    const result = await listStudents(repository, USER_ID, {
      action: 'list_students',
      filters: {},
      page: 3,
      pageSize: 15,
    }, new Date('2026-07-21T12:00:00.000Z'));

    expect(repository.listStudentsPage).toHaveBeenCalledWith(expect.objectContaining({
      limit: 15,
      offset: 30,
      userId: USER_ID,
    }));
    expect(result).toMatchObject({
      items: [],
      page: 3,
      pageSize: 15,
      totalCount: 31,
      totalPages: 3,
    });
    expect(JSON.stringify(result)).not.toMatch(/userId|user_id|full_name|total_count/);
  });

  it('returns the same 404 for inaccessible and missing students', async () => {
    vi.mocked(repository.userCanAccessStudent).mockResolvedValue(false);
    await expect(getStudentProfile(repository, USER_ID, {
      action: 'get_profile',
      studentId: STUDENT_ID,
    })).rejects.toMatchObject({ code: 'not_found', status: 404 });
    expect(repository.findStudent).not.toHaveBeenCalled();

    vi.mocked(repository.userCanAccessStudent).mockResolvedValue(true);
    vi.mocked(repository.findStudent).mockResolvedValue(null);
    await expect(getStudentProfile(repository, USER_ID, {
      action: 'get_profile',
      studentId: STUDENT_ID,
    })).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  it('returns a scoped camelCase profile DTO', async () => {
    const result = await getStudentProfile(
      repository,
      USER_ID,
      { action: 'get_profile', studentId: STUDENT_ID },
      new Date('2026-07-21T12:00:00.000Z'),
    );

    expect(repository.listStudentCourseIds).toHaveBeenCalledWith(USER_ID, STUDENT_ID);
    expect(result).toMatchObject({
      student: { id: STUDENT_ID, name: 'Ana', riskLevel: 'atencao' },
      courses: [{ id: COURSE_ID, grade: { raw: 8, percentage: 80 } }],
      metadata: { contractVersion: 1 },
    });
    expect(JSON.stringify(result)).not.toMatch(/student_id|course_id|grade_raw|last_sync/);
  });
});
