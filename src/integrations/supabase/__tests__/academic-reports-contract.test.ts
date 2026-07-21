import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseAcademicReportsPayload } from '../../../../supabase/functions/academic-reports/payload.ts';
import type { AcademicReportsRepository } from '../../../../supabase/functions/academic-reports/repository.ts';
import {
  authorizeAcademicReportsAction,
  getAcademicGradesReport,
  listAcademicReportCourses,
} from '../../../../supabase/functions/academic-reports/service.ts';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';

function createRepository(): AcademicReportsRepository {
  return {
    hasTutorCourseScope: vi.fn(async () => true),
    listActivities: vi.fn(async () => []),
    listCourseGrades: vi.fn(async () => [{
      courseId: COURSE_ID,
      gradePercentage: 90,
      gradeRaw: 18,
      id: 'grade-1',
      studentId: 'student-1',
    }]),
    listCourses: vi.fn(async () => [{
      category: 'Turma A',
      endAt: '2026-12-31T00:00:00.000Z',
      id: COURSE_ID,
      name: 'Matematica',
      shortName: 'MAT',
      startAt: '2026-01-01T00:00:00.000Z',
    }]),
    listEnrollments: vi.fn(async () => [{
      courseId: COURSE_ID,
      enrollmentStatus: 'ativo',
      lastAccessAt: '2026-07-20T00:00:00.000Z',
      studentId: 'student-1',
      studentName: 'Ana',
    }]),
    listTutorCourses: vi.fn(async () => [{
      category: 'Turma A',
      endAt: '2026-12-31T00:00:00.000Z',
      id: COURSE_ID,
      name: 'Matematica',
      shortName: 'MAT',
      startAt: '2026-01-01T00:00:00.000Z',
    }]),
    userHasPermission: vi.fn(async () => true),
  };
}

describe('academic-reports V1 contract', () => {
  let repository: AcademicReportsRepository;

  beforeEach(() => {
    repository = createRepository();
  });

  it('accepts strict use-case payloads without browser identity', () => {
    expect(parseAcademicReportsPayload({ action: 'list_courses' })).toEqual({
      action: 'list_courses',
    });
    expect(parseAcademicReportsPayload({
      action: 'get_grades_report',
      courseIds: [COURSE_ID],
      includeSuspendedStudents: false,
    })).toEqual({
      action: 'get_grades_report',
      courseIds: [COURSE_ID],
      includeSuspendedStudents: false,
    });
    expect(parseAcademicReportsPayload({
      action: 'get_pending_activities_report',
      courseIds: [COURSE_ID],
    })).toEqual({
      action: 'get_pending_activities_report',
      courseIds: [COURSE_ID],
    });
  });

  it.each([
    {},
    { action: 'list_courses', userId: 'spoofed' },
    { action: 'get_grades_report', courseIds: [], includeSuspendedStudents: true },
    { action: 'get_grades_report', courseIds: [COURSE_ID, COURSE_ID], includeSuspendedStudents: true },
    { action: 'get_grades_report', courseIds: [COURSE_ID], includeSuspendedStudents: 'true' },
    { action: 'get_pending_activities_report', courseIds: ['invalid'] },
    { action: 'get_pending_activities_report', courseIds: [COURSE_ID], user_id: 'spoofed' },
  ])('rejects malformed, duplicate, extra or identity fields: %o', (payload) => {
    expect(() => parseAcademicReportsPayload(payload)).toThrowError(
      expect.objectContaining({ status: 422 }),
    );
  });

  it('requires reports.view and tutor scope for report datasets', async () => {
    await expect(authorizeAcademicReportsAction(repository, 'user-1', {
      action: 'get_grades_report',
      courseIds: [COURSE_ID],
      includeSuspendedStudents: true,
    })).resolves.toBe(true);
    expect(repository.userHasPermission).toHaveBeenCalledWith('user-1', 'reports.view');
    expect(repository.hasTutorCourseScope).toHaveBeenCalledWith('user-1', [COURSE_ID]);

    vi.mocked(repository.hasTutorCourseScope).mockResolvedValue(false);
    await expect(authorizeAcademicReportsAction(repository, 'user-1', {
      action: 'get_pending_activities_report',
      courseIds: [COURSE_ID],
    })).resolves.toBe(false);

    vi.mocked(repository.hasTutorCourseScope).mockResolvedValue(true);
    vi.mocked(repository.userHasPermission).mockResolvedValue(false);
    await expect(authorizeAcademicReportsAction(repository, 'user-1', {
      action: 'get_grades_report',
      courseIds: [COURSE_ID],
      includeSuspendedStudents: true,
    })).resolves.toBe(false);
  });

  it('lists only repository-provided tutor courses in a camelCase DTO', async () => {
    const result = await listAcademicReportCourses(
      repository,
      'user-1',
      new Date('2026-07-21T12:00:00.000Z'),
    );

    expect(repository.listTutorCourses).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({
      items: [{
        category: 'Turma A',
        effectiveEndsAt: '2026-12-31T00:00:00.000Z',
        endsAt: '2026-12-31T00:00:00.000Z',
        id: COURSE_ID,
        lifecycleStatus: 'em_andamento',
        name: 'Matematica',
        shortName: 'MAT',
        startsAt: '2026-01-01T00:00:00.000Z',
      }],
      metadata: {
        contractVersion: 1,
        generatedAt: '2026-07-21T12:00:00.000Z',
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/course_id|start_date|short_name|userId/);
  });

  it('consolidates grades without loading activity rows', async () => {
    const result = await getAcademicGradesReport(
      repository,
      {
        action: 'get_grades_report',
        courseIds: [COURSE_ID],
        includeSuspendedStudents: true,
      },
      new Date('2026-07-21T12:00:00.000Z'),
    );

    expect(result.students[0]).toMatchObject({
      grades: [{ courseId: COURSE_ID, gradePercentage: 90, gradeRaw: 18 }],
      isSuspended: false,
      name: 'Ana',
    });
    expect(repository.listActivities).not.toHaveBeenCalled();
  });
});
