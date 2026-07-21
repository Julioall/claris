import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COURSE_CATALOG_MAX_COURSE_IDS } from '../../../../supabase/functions/courses-catalog/contract.ts';
import { parseCourseCatalogPayload } from '../../../../supabase/functions/courses-catalog/payload.ts';
import type {
  CourseCatalogRecord,
  CourseCatalogRepository,
} from '../../../../supabase/functions/courses-catalog/repository.ts';
import {
  executeCourseCatalogAction,
  getCourseCatalog,
} from '../../../../supabase/functions/courses-catalog/service.ts';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_COURSE_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-07-21T15:00:00.000Z');

function createRepository(): CourseCatalogRepository {
  return {
    hasCourseAssociationScope: vi.fn(async () => true),
    getCatalog: vi.fn(async () => []),
    setAssociationRole: vi.fn(async () => 0),
    setAttendanceEnabled: vi.fn(async () => 0),
    setIgnored: vi.fn(async () => 0),
    userHasPermission: vi.fn(async () => true),
  };
}

function catalogRecord(overrides: Partial<CourseCatalogRecord> = {}): CourseCatalogRecord {
  return {
    atRiskStudentCount: 1,
    category: 'Senai > Escola A > Curso X > Turma 1',
    createdAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2026-12-20T00:00:00.000Z',
    id: COURSE_ID,
    isAttendanceEnabled: false,
    isFollowing: true,
    isIgnored: false,
    lastSynchronizedAt: '2026-07-21T14:00:00.000Z',
    moodleCourseId: 'moodle-1',
    name: 'UC 1',
    shortName: 'UC1',
    startsAt: '2026-01-10T00:00:00.000Z',
    studentCount: 12,
    studentIds: ['student-1'],
    updatedAt: '2026-07-21T14:00:00.000Z',
    ...overrides,
  };
}

describe('courses-catalog payload contract', () => {
  it('accepts all V1 actions without browser-provided identity', () => {
    expect(parseCourseCatalogPayload({ action: 'get_catalog' }))
      .toEqual({ action: 'get_catalog' });
    expect(parseCourseCatalogPayload({
      action: 'set_association_role',
      courseIds: [COURSE_ID],
      role: 'tutor',
    })).toEqual({
      action: 'set_association_role',
      courseIds: [COURSE_ID],
      role: 'tutor',
    });
    expect(parseCourseCatalogPayload({
      action: 'set_ignored',
      courseIds: [COURSE_ID],
      ignored: false,
    })).toEqual({
      action: 'set_ignored',
      courseIds: [COURSE_ID],
      ignored: false,
    });
    expect(parseCourseCatalogPayload({
      action: 'set_attendance_enabled',
      courseIds: [COURSE_ID],
      enabled: true,
    })).toEqual({
      action: 'set_attendance_enabled',
      courseIds: [COURSE_ID],
      enabled: true,
    });
  });

  it('normalizes UUID case and rejects equivalent duplicates', () => {
    expect(parseCourseCatalogPayload({
      action: 'set_ignored',
      courseIds: [COURSE_ID.toUpperCase()],
      ignored: true,
    })).toMatchObject({ courseIds: [COURSE_ID] });

    expect(() => parseCourseCatalogPayload({
      action: 'set_ignored',
      courseIds: [COURSE_ID, COURSE_ID.toUpperCase()],
      ignored: true,
    })).toThrowError(expect.objectContaining({ status: 422 }));
  });

  it('accepts at most 200 unique course UUIDs', () => {
    const courseIds = Array.from({ length: COURSE_CATALOG_MAX_COURSE_IDS }, (_, index) => (
      `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    ));

    expect(parseCourseCatalogPayload({
      action: 'set_ignored',
      courseIds,
      ignored: true,
    })).toMatchObject({ courseIds });

    expect(() => parseCourseCatalogPayload({
      action: 'set_ignored',
      courseIds: [...courseIds, '33333333-3333-4333-8333-333333333333'],
      ignored: true,
    })).toThrowError(expect.objectContaining({ status: 422 }));
  });

  it.each([
    {},
    { action: 'unknown' },
    { action: 'get_catalog', userId: 'spoofed' },
    { action: 'get_catalog', p_user_id: 'spoofed' },
    { action: 'get_catalog', extra: true },
    { action: 'set_association_role', courseIds: [], role: 'tutor' },
    { action: 'set_association_role', courseIds: [COURSE_ID], role: 'admin' },
    { action: 'set_association_role', courseIds: ['not-an-id'], role: 'viewer' },
    { action: 'set_ignored', courseIds: [COURSE_ID], ignored: 'true' },
    { action: 'set_ignored', courseIds: [COURSE_ID], ignored: true, enabled: true },
    { action: 'set_attendance_enabled', courseIds: [COURSE_ID] },
  ])('rejects malformed, unknown or identity-bearing input: %o', (payload) => {
    expect(() => parseCourseCatalogPayload(payload)).toThrowError(
      expect.objectContaining({ status: 422 }),
    );
  });
});

describe('courses-catalog service contract', () => {
  let repository: CourseCatalogRepository;

  beforeEach(() => {
    repository = createRepository();
  });

  it('derives catalog scope from the authenticated actor and returns a camelCase V1 DTO', async () => {
    vi.mocked(repository.getCatalog).mockResolvedValue([
      catalogRecord(),
      catalogRecord({
        id: SECOND_COURSE_ID,
        name: 'UC 2',
        startsAt: '2026-08-10T00:00:00.000Z',
        studentIds: [],
      }),
    ]);

    const result = await getCourseCatalog(repository, 'authenticated-user', { now: NOW });

    expect(repository.getCatalog).toHaveBeenCalledWith('authenticated-user');
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          atRiskStudentCount: 1,
          effectiveEndsAt: '2026-08-10T00:00:00.000Z',
          id: COURSE_ID,
          isFollowing: true,
          lifecycleStatus: 'em_andamento',
          moodleCourseId: 'moodle-1',
          studentCount: 12,
          studentIds: ['student-1'],
        }),
        expect.objectContaining({
          id: SECOND_COURSE_ID,
          lifecycleStatus: 'nao_iniciada',
        }),
      ],
      metadata: {
        contractVersion: 1,
        generatedAt: NOW.toISOString(),
      },
    });
    expect(JSON.stringify(result)).not.toContain('authenticated-user');
    expect(JSON.stringify(result)).not.toMatch(/start_date|student_count|user_id/);
  });

  it('forwards every command with authenticated identity and returns only command metadata', async () => {
    vi.mocked(repository.setAssociationRole).mockResolvedValue(1);
    vi.mocked(repository.setIgnored).mockResolvedValue(2);
    vi.mocked(repository.setAttendanceEnabled).mockResolvedValue(2);

    await expect(executeCourseCatalogAction(repository, 'actor-from-jwt', {
      action: 'set_association_role',
      courseIds: [COURSE_ID],
      role: 'viewer',
    })).resolves.toEqual({
      action: 'set_association_role',
      affectedCourseCount: 1,
      contractVersion: 1,
    });
    await executeCourseCatalogAction(repository, 'actor-from-jwt', {
      action: 'set_ignored',
      courseIds: [COURSE_ID, SECOND_COURSE_ID],
      ignored: true,
    });
    await executeCourseCatalogAction(repository, 'actor-from-jwt', {
      action: 'set_attendance_enabled',
      courseIds: [COURSE_ID, SECOND_COURSE_ID],
      enabled: false,
    });

    expect(repository.setAssociationRole).toHaveBeenCalledWith({
      courseIds: [COURSE_ID],
      role: 'viewer',
      userId: 'actor-from-jwt',
    });
    expect(repository.setIgnored).toHaveBeenCalledWith({
      courseIds: [COURSE_ID, SECOND_COURSE_ID],
      ignored: true,
      userId: 'actor-from-jwt',
    });
    expect(repository.setAttendanceEnabled).toHaveBeenCalledWith({
      courseIds: [COURSE_ID, SECOND_COURSE_ID],
      enabled: false,
      userId: 'actor-from-jwt',
    });
    expect(repository.hasCourseAssociationScope).toHaveBeenCalledWith(
      'actor-from-jwt',
      [COURSE_ID],
    );
  });

  it('does not let a non-admin actor create course access through role assignment', async () => {
    vi.mocked(repository.hasCourseAssociationScope).mockResolvedValue(false);

    await expect(executeCourseCatalogAction(repository, 'actor-from-jwt', {
      action: 'set_association_role',
      courseIds: [SECOND_COURSE_ID],
      role: 'tutor',
    })).rejects.toMatchObject({ status: 403 });

    expect(repository.setAssociationRole).not.toHaveBeenCalled();
  });

  it.each([
    ['42501', 403],
    ['P0002', 404],
    ['22023', 422],
  ])('maps database command error %s to HTTP status %i', async (code, status) => {
    vi.mocked(repository.setAttendanceEnabled).mockRejectedValue({ code });

    await expect(executeCourseCatalogAction(repository, 'actor-from-jwt', {
      action: 'set_attendance_enabled',
      courseIds: [COURSE_ID],
      enabled: true,
    })).rejects.toMatchObject({ status });
  });
});
