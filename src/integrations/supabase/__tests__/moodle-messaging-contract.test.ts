import { describe, expect, it, vi } from 'vitest';

import { parseMessagingPayload } from '../../../../supabase/functions/moodle-messaging/payload.ts';
import { createMoodleMessagingRepository } from '../../../../supabase/functions/moodle-messaging/repository.ts';

function v1Request() {
  return new Request('http://localhost/moodle-messaging', {
    headers: { 'x-claris-api-version': '1' },
    method: 'POST',
  });
}

describe('moodle-messaging V1 contract', () => {
  it('accepts bounded intent without Moodle credentials', () => {
    expect(parseMessagingPayload({ action: 'get_conversations' }, v1Request())).toEqual({
      action: 'get_conversations',
      requestVersion: 'v1',
    });
    expect(parseMessagingPayload({
      action: 'get_messages',
      limit: 25,
      moodleUserId: 20,
    }, v1Request())).toEqual({
      action: 'get_messages',
      limit: 25,
      moodleUserId: 20,
      requestVersion: 'v1',
    });
  });

  it.each([
    { action: 'get_conversations', moodleUrl: 'https://moodle.example.com' },
    { action: 'get_conversations', token: 'browser-token' },
    { action: 'get_messages', limit_num: 25, moodle_user_id: 20 },
    { action: 'get_messages', limit: 101, moodleUserId: 20 },
    { action: 'send_message', message: 'Ola', moodleUserId: 20, userId: 'spoof' },
  ])('rejects browser-controlled credentials, identity or legacy fields: %o', (payload) => {
    expect(() => parseMessagingPayload(payload, v1Request())).toThrowError(
      expect.objectContaining({ status: 422 }),
    );
  });

  it('maps students only after deriving tutor course scope from the actor', async () => {
    const filterMoodleIds = vi.fn(async () => ({
      data: [{
        student_id: 'student-1',
        students: { moodle_user_id: '20' },
      }],
      error: null,
    }));
    const filterCourseIds = vi.fn(() => ({ in: filterMoodleIds }));
    const select = vi.fn(() => ({ in: filterCourseIds }));
    const client = {
      from: vi.fn(() => ({ select })),
      rpc: vi.fn(async () => ({ data: [{ course_id: 'course-1' }], error: null })),
    };
    const repository = createMoodleMessagingRepository(client as never);

    await expect(repository.listAccessibleStudentIds('actor-1', [20, 20])).resolves.toEqual(
      new Map([['20', 'student-1']]),
    );
    expect(client.rpc).toHaveBeenCalledWith('list_accessible_course_ids', {
      p_role_filter: 'tutor',
      p_user_id: 'actor-1',
    });
    expect(client.from).toHaveBeenCalledWith('student_courses');
    expect(filterCourseIds).toHaveBeenCalledWith('course_id', ['course-1']);
    expect(filterMoodleIds).toHaveBeenCalledWith('students.moodle_user_id', ['20']);
  });
});
