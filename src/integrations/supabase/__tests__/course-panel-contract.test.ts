import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseCoursePanelPayload } from '../../../../supabase/functions/course-panel/payload.ts';
import type {
  CoursePanelActivityRecord,
  CoursePanelEnrollmentRecord,
  CoursePanelRepository,
} from '../../../../supabase/functions/course-panel/repository.ts';
import {
  authorizeCoursePanelAction,
  getCoursePanel,
  setCourseActivityVisibility,
} from '../../../../supabase/functions/course-panel/service.ts';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const NEXT_COURSE_ID = '22222222-2222-4222-8222-222222222222';

function createRepository(): CoursePanelRepository {
  return {
    findCourse: vi.fn(async () => ({
      category: 'SENAI > Escola > Curso > Turma',
      endAt: '2026-12-31T23:59:59.000Z',
      id: COURSE_ID,
      lastSyncedAt: '2026-02-15T12:00:00.000Z',
      moodleCourseId: '101',
      name: 'Curso principal',
      shortName: 'CURSO',
      startAt: '2026-01-01T03:00:00.000Z',
      updatedAt: '2026-02-16T12:00:00.000Z',
    })),
    isAttendanceEnabled: vi.fn(async () => true),
    listAccessibleCourseDates: vi.fn(async () => []),
    listActivities: vi.fn(async () => []),
    listEnrollments: vi.fn(async () => []),
    setActivityVisibility: vi.fn(async () => 3),
    userCanAccessCourse: vi.fn(async () => true),
    userHasPermission: vi.fn(async () => true),
  };
}

function enrollment(
  studentId: string,
  name: string,
  enrollmentStatus: string,
  riskLevel: string,
): CoursePanelEnrollmentRecord {
  return {
    enrollmentStatus,
    lastAccessAt: `2026-02-0${studentId.slice(-1)}T12:00:00.000Z`,
    lastSyncedAt: '2026-02-17T12:00:00.000Z',
    student: {
      avatarUrl: null,
      email: `${studentId}@example.com`,
      id: studentId,
      lastAccessAt: null,
      name,
      riskLevel,
      updatedAt: '2026-02-18T12:00:00.000Z',
    },
    studentId,
  };
}

function activity(
  moodleActivityId: string,
  studentId: string,
  overrides: Partial<CoursePanelActivityRecord> = {},
): CoursePanelActivityRecord {
  return {
    activityType: 'assign',
    completedAt: null,
    courseId: COURSE_ID,
    dueAt: '2026-03-10T12:00:00.000Z',
    grade: null,
    gradedAt: null,
    gradeMax: 10,
    hidden: false,
    id: `${moodleActivityId}-${studentId}`,
    moodleActivityId,
    name: `Atividade ${moodleActivityId}`,
    percentage: null,
    status: 'pending',
    studentId,
    submittedAt: null,
    updatedAt: '2026-02-20T12:00:00.000Z',
    ...overrides,
  };
}

describe('course-panel V1 contract', () => {
  let repository: CoursePanelRepository;

  beforeEach(() => {
    repository = createRepository();
  });

  it('accepts both use-case payloads without browser-provided identity', () => {
    expect(parseCoursePanelPayload({
      action: 'get_panel',
      courseId: COURSE_ID,
    })).toEqual({ action: 'get_panel', courseId: COURSE_ID });

    expect(parseCoursePanelPayload({
      action: 'set_activity_visibility',
      courseId: COURSE_ID,
      hidden: true,
      moodleActivityId: ' 77 ',
    })).toEqual({
      action: 'set_activity_visibility',
      courseId: COURSE_ID,
      hidden: true,
      moodleActivityId: '77',
    });
  });

  it.each([
    {},
    { action: 'unknown', courseId: COURSE_ID },
    { action: 'get_panel', courseId: 'not-a-uuid' },
    { action: 'get_panel', courseId: COURSE_ID, userId: 'spoofed' },
    { action: 'get_panel', courseId: COURSE_ID, extra: true },
    { action: 'set_activity_visibility', courseId: COURSE_ID, hidden: 'true', moodleActivityId: '1' },
    { action: 'set_activity_visibility', courseId: COURSE_ID, hidden: true, moodleActivityId: '   ' },
    { action: 'set_activity_visibility', courseId: COURSE_ID, hidden: true, moodleActivityId: '1', user_id: 'spoofed' },
  ])('rejects unknown, malformed or identity fields: %o', (payload) => {
    expect(() => parseCoursePanelPayload(payload)).toThrowError(
      expect.objectContaining({ status: 422 }),
    );
  });

  it('authorizes reads and writes with their own permission plus course access', async () => {
    await expect(authorizeCoursePanelAction(repository, 'user-1', {
      action: 'get_panel',
      courseId: COURSE_ID,
    })).resolves.toBe(true);
    expect(repository.userHasPermission).toHaveBeenLastCalledWith(
      'user-1',
      'courses.panel.view',
    );
    expect(repository.userCanAccessCourse).toHaveBeenLastCalledWith('user-1', COURSE_ID);

    await expect(authorizeCoursePanelAction(repository, 'user-1', {
      action: 'set_activity_visibility',
      courseId: COURSE_ID,
      hidden: true,
      moodleActivityId: '77',
    })).resolves.toBe(true);
    expect(repository.userHasPermission).toHaveBeenLastCalledWith(
      'user-1',
      'courses.activities.visibility.manage',
    );

    vi.mocked(repository.userCanAccessCourse).mockResolvedValue(false);
    await expect(authorizeCoursePanelAction(repository, 'user-1', {
      action: 'get_panel',
      courseId: COURSE_ID,
    })).resolves.toBe(false);
  });

  it('builds one independent DTO with effective dates, nested workflows and backend stats', async () => {
    vi.mocked(repository.listAccessibleCourseDates).mockResolvedValue([
      {
        category: 'SENAI > Escola > Curso > Turma',
        endAt: '2026-12-31T23:59:59.000Z',
        id: COURSE_ID,
        startAt: '2026-01-01T03:00:00.000Z',
      },
      {
        category: 'SENAI > Escola > Curso > Turma',
        endAt: '2026-12-31T23:59:59.000Z',
        id: NEXT_COURSE_ID,
        startAt: '2026-06-01T03:00:00.000Z',
      },
    ]);
    vi.mocked(repository.listEnrollments).mockResolvedValue([
      enrollment('student-1', 'Ana', 'ativo', 'risco'),
      enrollment('student-2', 'Bia', 'suspenso', 'critico'),
      enrollment('student-3', 'Carla', 'concluido', 'critico'),
    ]);
    vi.mocked(repository.listActivities).mockResolvedValue([
      activity('activity-1', 'student-1', {
        grade: 8,
        name: 'Trabalho',
        status: 'graded',
      }),
      activity('activity-1', 'student-2', {
        grade: 9,
        name: 'Trabalho',
        status: 'graded',
      }),
      activity('activity-1', 'student-3', {
        name: 'Trabalho',
        status: 'submitted',
        submittedAt: '2026-02-19T12:00:00.000Z',
      }),
      activity('activity-2', 'student-1', {
        gradeMax: 10,
        hidden: true,
        name: 'Oculta com peso',
      }),
      activity('activity-3', 'student-1', {
        gradeMax: 0,
        hidden: false,
        name: 'Visível sem peso',
      }),
    ]);

    const result = await getCoursePanel(repository, 'user-1', {
      action: 'get_panel',
      courseId: COURSE_ID,
    }, new Date('2026-03-01T12:00:00.000Z'));

    expect(result).toMatchObject({
      attendanceEnabled: true,
      course: {
        effectiveEndsAt: '2026-06-01T03:00:00.000Z',
        lifecycle: 'inProgress',
        moodleCourseId: '101',
      },
      metadata: {
        contractVersion: 1,
        dataUpdatedAt: '2026-02-20T12:00:00.000Z',
        generatedAt: '2026-03-01T12:00:00.000Z',
      },
      stats: {
        atRiskStudents: 1,
        completionRate: 67,
        riskDistribution: { atencao: 0, critico: 0, normal: 0, risco: 1 },
        totalActivities: 2,
        totalStudents: 2,
      },
    });
    expect(result.students.map((student) => student.name)).toEqual(['Ana', 'Bia', 'Carla']);

    const assignment = result.activities.find((item) => item.moodleActivityId === 'activity-1');
    expect(assignment).toMatchObject({
      hidden: false,
      isAssignment: true,
      submissionCounts: {
        completed: 0,
        corrected: 2,
        pendingCorrection: 1,
        pendingSubmission: 0,
        total: 3,
      },
    });
    expect(assignment?.submissions.map((submission) => submission.workflowStatus)).toEqual([
      'corrected',
      'corrected',
      'pendingCorrection',
    ]);

    // Manual/persisted visibility wins regardless of gradebook weight.
    expect(result.activities.find((item) => item.moodleActivityId === 'activity-2')?.hidden).toBe(true);
    expect(result.activities.find((item) => item.moodleActivityId === 'activity-3')?.hidden).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/student_id|course_id|moodle_activity_id/);
  });

  it('writes visibility only through the authenticated repository command', async () => {
    const result = await setCourseActivityVisibility(repository, 'authenticated-user', {
      action: 'set_activity_visibility',
      courseId: COURSE_ID,
      hidden: true,
      moodleActivityId: '77',
    }, new Date('2026-03-01T12:00:00.000Z'));

    expect(repository.setActivityVisibility).toHaveBeenCalledWith({
      courseId: COURSE_ID,
      hidden: true,
      moodleActivityId: '77',
      userId: 'authenticated-user',
    });
    expect(result).toEqual({
      courseId: COURSE_ID,
      hidden: true,
      metadata: {
        contractVersion: 1,
        generatedAt: '2026-03-01T12:00:00.000Z',
      },
      moodleActivityId: '77',
      updatedCount: 3,
    });
  });

  it('maps protected visibility RPC errors to stable API errors', async () => {
    vi.mocked(repository.setActivityVisibility).mockRejectedValue({ code: 'P0002' });

    await expect(setCourseActivityVisibility(repository, 'user-1', {
      action: 'set_activity_visibility',
      courseId: COURSE_ID,
      hidden: false,
      moodleActivityId: 'missing',
    })).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });
});
