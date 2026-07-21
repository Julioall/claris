import { describe, expect, it } from 'vitest';

import {
  buildAcademicGradesReportStudents,
  buildAcademicPendingActivitiesReport,
  mapAcademicReportCourses,
  type AcademicReportActivityRecord,
  type AcademicReportCourseRecord,
  type AcademicReportEnrollmentRecord,
} from '../../../../supabase/functions/academic-reports/rules.ts';

const COURSE_ID = 'course-1';
const FUTURE_COURSE_ID = 'course-future';

const courses: AcademicReportCourseRecord[] = [
  {
    category: 'Turma A',
    endAt: '2026-12-31T00:00:00.000Z',
    id: COURSE_ID,
    name: 'Matematica',
    shortName: 'MAT',
    startAt: '2026-01-01T00:00:00.000Z',
  },
  {
    category: 'Turma A',
    endAt: '2026-12-31T00:00:00.000Z',
    id: FUTURE_COURSE_ID,
    name: 'Fisica',
    shortName: 'FIS',
    startAt: '2026-10-01T00:00:00.000Z',
  },
];

const enrollments: AcademicReportEnrollmentRecord[] = [
  {
    courseId: COURSE_ID,
    enrollmentStatus: 'ativo',
    lastAccessAt: '2026-07-20T00:00:00.000Z',
    studentId: 'student-ana',
    studentName: 'Ana',
  },
  {
    courseId: COURSE_ID,
    enrollmentStatus: 'ativo',
    lastAccessAt: null,
    studentId: 'student-carla',
    studentName: 'Carla',
  },
  {
    courseId: COURSE_ID,
    enrollmentStatus: 'suspenso',
    lastAccessAt: null,
    studentId: 'student-suspended',
    studentName: 'Bruno',
  },
];

function activity(
  id: string,
  studentId: string,
  overrides: Partial<AcademicReportActivityRecord> = {},
): AcademicReportActivityRecord {
  return {
    activityName: id,
    activityType: 'assign',
    completedAt: null,
    courseId: COURSE_ID,
    grade: null,
    gradeMax: 100,
    gradedAt: null,
    hidden: false,
    id,
    moodleActivityId: id,
    status: 'pending',
    studentId,
    submittedAt: null,
    ...overrides,
  };
}

describe('academic report domain rules', () => {
  it('infers effective unit dates and returns stable lifecycle ordering', () => {
    expect(mapAcademicReportCourses(
      courses,
      new Date('2026-07-21T00:00:00.000Z'),
      'start',
    )).toMatchObject([
      {
        effectiveEndsAt: '2026-10-01T00:00:00.000Z',
        id: COURSE_ID,
        lifecycleStatus: 'em_andamento',
      },
      {
        effectiveEndsAt: '2026-12-31T00:00:00.000Z',
        id: FUTURE_COURSE_ID,
        lifecycleStatus: 'nao_iniciada',
      },
    ]);
  });

  it('uses raw grades for cells, percentages for styling and filters suspended students in backend', () => {
    const units = mapAcademicReportCourses(courses.slice(0, 1), new Date('2026-07-21'), 'start');
    const grades = [{
      courseId: COURSE_ID,
      gradePercentage: 90,
      gradeRaw: 18,
      id: 'grade-1',
      studentId: 'student-ana',
    }];

    expect(buildAcademicGradesReportStudents(units, enrollments, grades, false)).toEqual([
      {
        grades: [{ courseId: COURSE_ID, gradePercentage: 90, gradeRaw: 18 }],
        isSuspended: false,
        lastAccessAt: '2026-07-20T00:00:00.000Z',
        name: 'Ana',
        studentId: 'student-ana',
      },
      {
        grades: [],
        isSuspended: false,
        lastAccessAt: null,
        name: 'Carla',
        studentId: 'student-carla',
      },
    ]);

    expect(buildAcademicGradesReportStudents(units, enrollments, grades, true).at(-1)).toMatchObject({
      isSuspended: true,
      name: 'Bruno',
    });
  });

  it('centralizes evaluative, visibility, workflow, suspension and course-start filters', () => {
    const activities = [
      activity('shared', 'student-ana', { activityName: 'Envio', gradeMax: 100 }),
      activity('shared-row', 'student-carla', {
        activityName: 'Mesmo item sem peso na linha',
        gradeMax: null,
        moodleActivityId: 'shared',
        status: 'submitted',
        submittedAt: '2026-07-20T00:00:00.000Z',
      }),
      activity('second', 'student-ana', { activityName: 'Outro envio' }),
      activity('corrected', 'student-ana', { grade: 8 }),
      activity('completed', 'student-ana', { completedAt: '2026-07-20T00:00:00.000Z', status: 'completed' }),
      activity('quiz', 'student-ana', { activityType: 'quiz' }),
      activity('scorm', 'student-ana', { activityType: 'scorm' }),
      activity('hidden', 'student-ana', { hidden: true }),
      activity('weight-zero', 'student-ana', { gradeMax: 0 }),
      activity('suspended', 'student-suspended'),
      activity('future', 'student-ana', { courseId: FUTURE_COURSE_ID }),
    ];

    const result = buildAcademicPendingActivitiesReport({
      activities,
      courses,
      enrollments,
      now: new Date('2026-07-21T00:00:00.000Z'),
    });

    expect(result.students).toEqual([
      {
        lastAccessAt: '2026-07-20T00:00:00.000Z',
        name: 'Ana',
        pendingCorrectionCount: 0,
        pendingSubmissionCount: 2,
        studentId: 'student-ana',
        totalCount: 2,
      },
      {
        lastAccessAt: null,
        name: 'Carla',
        pendingCorrectionCount: 1,
        pendingSubmissionCount: 0,
        studentId: 'student-carla',
        totalCount: 1,
      },
    ]);
    expect(result.details.map(({ activityName, workflowStatus }) => ({ activityName, workflowStatus }))).toEqual([
      { activityName: 'Envio', workflowStatus: 'pendingSubmission' },
      { activityName: 'Outro envio', workflowStatus: 'pendingSubmission' },
      { activityName: 'Mesmo item sem peso na linha', workflowStatus: 'pendingCorrection' },
    ]);
  });
});
