import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeEdgeFunctionMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  invokeEdgeFunction: invokeEdgeFunctionMock,
}));

import {
  debugStudentGrades,
  listGradeDebugCourses,
  listGradeDebugStudents,
} from '../gradeDebug';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333';

describe('grade diagnostics API', () => {
  beforeEach(() => {
    invokeEdgeFunctionMock.mockReset();
    invokeEdgeFunctionMock.mockResolvedValue({ contractVersion: 1, items: [] });
  });

  it('uses explicit admin list intents', async () => {
    await listGradeDebugCourses(CONNECTION_ID);
    await listGradeDebugStudents(CONNECTION_ID, COURSE_ID);

    expect(invokeEdgeFunctionMock.mock.calls.map(([, options]) => options.body)).toEqual([
      { action: 'list_grade_courses', connectionId: CONNECTION_ID },
      { action: 'list_grade_students', connectionId: CONNECTION_ID, courseId: COURSE_ID },
    ]);
  });

  it('never sends Moodle credentials or provider identifiers from the browser', async () => {
    invokeEdgeFunctionMock.mockResolvedValue({
      contractVersion: 1,
      course: { id: COURSE_ID, name: 'Matematica' },
      courseGrade: null,
      items: [],
      operationId: '33333333-3333-4333-8333-333333333333',
      student: { id: STUDENT_ID, fullName: 'Ana' },
      summary: { returnedItems: 0, totalItems: 0, truncated: false },
    });

    await debugStudentGrades({ connectionId: CONNECTION_ID, courseId: COURSE_ID, studentId: STUDENT_ID });

    const body = invokeEdgeFunctionMock.mock.calls[0][1].body;
    expect(body).toEqual({
      action: 'run_grade_diagnostic',
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      studentId: STUDENT_ID,
    });
    expect(body).not.toHaveProperty('token');
    expect(body).not.toHaveProperty('moodleUrl');
    expect(body).not.toHaveProperty('userId');
  });
});
