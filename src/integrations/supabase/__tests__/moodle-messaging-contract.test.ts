import { describe, expect, it, vi } from 'vitest';

import { parseMessagingPayload } from '../../../../supabase/functions/moodle-messaging/payload.ts';
import { createMoodleMessagingRepository } from '../../../../supabase/functions/moodle-messaging/repository.ts';

function v1Request() {
  return new Request('http://localhost/moodle-messaging', {
    headers: { 'x-claris-api-version': '1' },
    method: 'POST',
  });
}

const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

describe('moodle-messaging V1 contract', () => {
  it('accepts bounded intent without Moodle credentials', () => {
    expect(parseMessagingPayload({ action: 'get_conversations', connectionId: CONNECTION_ID }, v1Request())).toEqual({
      action: 'get_conversations',
      connectionId: CONNECTION_ID,
    });
    expect(parseMessagingPayload({
      action: 'get_messages',
      connectionId: CONNECTION_ID,
      limit: 25,
      moodleUserId: 20,
    }, v1Request())).toEqual({
      action: 'get_messages',
      connectionId: CONNECTION_ID,
      limit: 25,
      moodleUserId: 20,
    });
  });

  it.each([
    { action: 'get_conversations', connectionId: CONNECTION_ID, moodleUrl: 'https://moodle.example.com' },
    { action: 'get_conversations', connectionId: CONNECTION_ID, token: 'browser-token' },
    { action: 'get_conversations' },
    { action: 'get_messages', limit_num: 25, moodle_user_id: 20 },
    { action: 'get_messages', connectionId: CONNECTION_ID, limit: 101, moodleUserId: 20 },
    { action: 'send_message', connectionId: CONNECTION_ID, message: 'Ola', moodleUserId: 20, userId: 'spoof' },
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
    const filterSiteId = vi.fn(() => ({ in: filterMoodleIds }));
    const filterCourseIds = vi.fn(() => ({ eq: filterSiteId }));
    const select = vi.fn(() => ({ in: filterCourseIds }));
    const client = {
      from: vi.fn(() => ({ select })),
      rpc: vi.fn(async () => ({ data: [{ course_id: 'course-1' }], error: null })),
    };
    const repository = createMoodleMessagingRepository(client as never);

    await expect(repository.listAccessibleStudentIds('actor-1', 'site-1', [20, 20])).resolves.toEqual(
      new Map([['20', 'student-1']]),
    );
    expect(client.rpc).toHaveBeenCalledWith('list_accessible_course_ids', {
      p_role_filter: 'tutor',
      p_user_id: 'actor-1',
    });
    expect(client.from).toHaveBeenCalledWith('student_courses');
    expect(filterCourseIds).toHaveBeenCalledWith('course_id', ['course-1']);
    expect(filterSiteId).toHaveBeenCalledWith('students.moodle_site_id', 'site-1');
    expect(filterMoodleIds).toHaveBeenCalledWith('students.moodle_user_id', ['20']);
  });
});
