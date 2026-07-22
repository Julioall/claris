import { describe, expect, it } from 'vitest';

import { parseMoodleGradeSuggestionPayload } from '../../../../supabase/functions/moodle-grade-suggestions/payload.ts';

const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const COURSE_ID = '22222222-2222-4222-8222-222222222222';
const STUDENT_ID = '33333333-3333-4333-8333-333333333333';

describe('moodle grade suggestions connection contract', () => {
  it('accepts only internal connection/course/student identifiers', () => {
    expect(parseMoodleGradeSuggestionPayload({
      action: 'generate_suggestion',
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      moodleActivityId: '42',
      studentId: STUDENT_ID,
    })).toEqual({
      action: 'generate_suggestion',
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      moodleActivityId: '42',
      studentId: STUDENT_ID,
    });
  });

  it.each([
    { action: 'generate_suggestion', courseId: COURSE_ID, moodleActivityId: '42', studentId: STUDENT_ID },
    { action: 'generate_activity_suggestions', connectionId: CONNECTION_ID, courseId: COURSE_ID, moodleActivityId: '42', token: 'browser-token' },
    { action: 'resume_activity_suggestion_job', connectionId: CONNECTION_ID, jobId: COURSE_ID, moodleUrl: 'https://attacker.invalid' },
    { action: 'approve_suggestion', connectionId: CONNECTION_ID, auditId: COURSE_ID, approvedGrade: 9, approvedFeedback: 'Ok', token: 'browser-token' },
  ])('rejects missing connections and browser-controlled credentials: %o', (payload) => {
    expect(() => parseMoodleGradeSuggestionPayload(payload)).toThrowError(
      expect.objectContaining({ status: 422 }),
    );
  });
});
