import { describe, expect, it } from 'vitest';

import { parseMoodleSyncActivitiesPayload } from '../../../../supabase/functions/moodle-sync-activities/payload.ts';
import { parseMoodleSyncStudentsPayload } from '../../../../supabase/functions/moodle-sync-students/payload.ts';
import { parseMoodleSyncGradesPayload } from '../../../../supabase/functions/moodle-sync-grades/payload.ts';

const CONNECTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COURSE_ID = '11111111-1111-4111-8111-111111111111';

describe('Moodle sync V2 request boundary', () => {
  it('accepts only internal connection and course identifiers for students', () => {
    expect(parseMoodleSyncStudentsPayload({
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
    })).toEqual({
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
    });
  });

  it('accepts paginated activity work without browser Moodle secrets', () => {
    expect(parseMoodleSyncActivitiesPayload({
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      studentBatchPage: 2,
      studentBatchSize: 25,
    })).toEqual({
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      studentBatchPage: 2,
      studentBatchSize: 25,
    });
  });

  it('accepts grade work using only internal scope identifiers', () => {
    expect(parseMoodleSyncGradesPayload({
      action: 'sync_grades',
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
    })).toEqual({
      action: 'sync_grades',
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      studentBatchPage: undefined,
      studentBatchSize: undefined,
    });
  });

  it.each([
    ['students', () => parseMoodleSyncStudentsPayload({
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      moodleUrl: 'https://attacker.invalid',
    })],
    ['students-token', () => parseMoodleSyncStudentsPayload({
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      token: 'browser-token',
    })],
    ['activities', () => parseMoodleSyncActivitiesPayload({
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      moodleUrl: 'https://attacker.invalid',
    })],
    ['activities-token', () => parseMoodleSyncActivitiesPayload({
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      token: 'browser-token',
    })],
    ['grades', () => parseMoodleSyncGradesPayload({
      action: 'sync_grades',
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      moodleUrl: 'https://attacker.invalid',
    })],
    ['grades-token', () => parseMoodleSyncGradesPayload({
      action: 'sync_grades',
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      token: 'browser-token',
    })],
  ])('rejects legacy or secret-bearing field %s', (_name, parse) => {
    expect(parse).toThrowError(expect.objectContaining({ status: 422 }));
  });
});
