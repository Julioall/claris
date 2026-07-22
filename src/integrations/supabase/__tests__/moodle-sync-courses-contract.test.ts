import { describe, expect, it, vi } from 'vitest';

import {
  linkEligibleUserCourses,
  replaceUserCourseEligibility,
} from '../../../../supabase/functions/_shared/domain/moodle-sync/repository.ts';
import { parseMoodleSyncCoursesPayload } from '../../../../supabase/functions/moodle-sync-courses/payload.ts';
import {
  executeEligibleCourseLink,
  upsertCoursesAndReplaceEligibility,
} from '../../../../supabase/functions/moodle-sync-courses/eligibility.ts';

const ACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONNECTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_COURSE_ID = '22222222-2222-4222-8222-222222222222';

function courseId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function linkDependencies(overrides: Record<string, unknown> = {}) {
  return {
    findUserById: vi.fn(async () => ({ id: ACTOR_ID, moodle_user_id: '42' })),
    linkEligibleUserCourses: vi.fn(async () => 2),
    now: () => new Date('2026-07-21T18:00:00.000Z'),
    touchUserLastSync: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('moodle-sync-courses selection payload', () => {
  it('uses only an internal connection id for Moodle discovery', () => {
    expect(parseMoodleSyncCoursesPayload({
      action: 'sync_courses',
      connectionId: CONNECTION_ID,
    })).toEqual({ action: 'sync_courses', connectionId: CONNECTION_ID });

    expect(() => parseMoodleSyncCoursesPayload({
      action: 'sync_courses',
      connectionId: CONNECTION_ID,
      moodleUrl: 'https://attacker.invalid',
      token: 'browser-token',
    })).toThrowError(expect.objectContaining({ status: 422 }));
  });

  it('accepts only unique UUIDs and normalizes their case', () => {
    expect(parseMoodleSyncCoursesPayload({
      action: 'link_selected_courses',
      connectionId: CONNECTION_ID,
      selectedCourseIds: [COURSE_ID.toUpperCase(), SECOND_COURSE_ID],
    })).toEqual({
      action: 'link_selected_courses',
      connectionId: CONNECTION_ID,
      selectedCourseIds: [COURSE_ID, SECOND_COURSE_ID],
    });
  });

  it('accepts at most 500 selected courses', () => {
    const courseIds = Array.from({ length: 500 }, (_, index) => courseId(index));
    expect(parseMoodleSyncCoursesPayload({
      action: 'link_selected_courses',
      connectionId: CONNECTION_ID,
      selectedCourseIds: courseIds,
    })).toMatchObject({ selectedCourseIds: courseIds });
  });

  it.each([
    { action: 'link_selected_courses', connectionId: CONNECTION_ID, selectedCourseIds: [] },
    { action: 'link_selected_courses', connectionId: CONNECTION_ID, selectedCourseIds: ['not-a-uuid'] },
    { action: 'link_selected_courses', selectedCourseIds: [COURSE_ID] },
    {
      action: 'link_selected_courses',
      connectionId: CONNECTION_ID,
      selectedCourseIds: [COURSE_ID, COURSE_ID.toUpperCase()],
    },
    {
      action: 'link_selected_courses',
      connectionId: CONNECTION_ID,
      selectedCourseIds: Array.from({ length: 501 }, (_, index) => courseId(index)),
    },
    {
      action: 'link_selected_courses',
      connectionId: CONNECTION_ID,
      selectedCourseIds: [COURSE_ID],
      userId: 'spoofed-user',
    },
    {
      action: 'link_selected_courses',
      connectionId: CONNECTION_ID,
      selectedCourseIds: [COURSE_ID],
      p_user_id: ACTOR_ID,
    },
  ])('rejects malformed or identity-bearing selection atomically: %o', (payload) => {
    expect(() => parseMoodleSyncCoursesPayload(payload)).toThrowError(
      expect.objectContaining({ status: 422 }),
    );
  });
});

describe('moodle-sync-courses eligibility persistence', () => {
  it('replaces the actor eligibility immediately after the Moodle course upsert', async () => {
    const calls: string[] = [];
    const syncedCourses = [{
      category: null,
      created_at: null,
      end_date: null,
      id: COURSE_ID,
      last_sync: null,
      moodle_course_id: '101',
      name: 'Matematica',
      short_name: null,
      start_date: null,
      updated_at: null,
    }];
    const upsertCourses = vi.fn(async () => {
      calls.push('upsert');
      return syncedCourses;
    });
    const replaceEligibility = vi.fn(async () => {
      calls.push('replace');
      return 1;
    });

    await expect(upsertCoursesAndReplaceEligibility(
      {} as never,
      ACTOR_ID,
      CONNECTION_ID,
      [{ moodle_course_id: '101', name: 'Matematica' }],
      {
        replaceUserCourseEligibility: replaceEligibility,
        upsertCourses,
      },
    )).resolves.toEqual(syncedCourses);

    expect(calls).toEqual(['upsert', 'replace']);
    expect(replaceEligibility).toHaveBeenCalledWith({}, ACTOR_ID, CONNECTION_ID, [COURSE_ID]);
  });

  it('uses the typed service-only RPCs without writing protected tables directly', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: 2, error: null })
      .mockResolvedValueOnce({ data: 1, error: null });
    const client = { rpc } as never;

    await expect(replaceUserCourseEligibility(
      client,
      ACTOR_ID,
      CONNECTION_ID,
      [COURSE_ID, SECOND_COURSE_ID],
    )).resolves.toBe(2);
    await expect(linkEligibleUserCourses(client, ACTOR_ID, CONNECTION_ID, [COURSE_ID])).resolves.toBe(1);

    expect(rpc.mock.calls).toEqual([
      ['backend_replace_user_course_eligibility', {
        p_course_ids: [COURSE_ID, SECOND_COURSE_ID],
        p_moodle_connection_id: CONNECTION_ID,
        p_user_id: ACTOR_ID,
      }],
      ['backend_link_eligible_user_courses', {
        p_course_ids: [COURSE_ID],
        p_moodle_connection_id: CONNECTION_ID,
        p_user_id: ACTOR_ID,
      }],
    ]);
  });
});

describe('moodle-sync-courses eligible linking', () => {
  it('links the full eligible selection in one atomic RPC and preserves the legacy response', async () => {
    const dependencies = linkDependencies();

    const response = await executeEligibleCourseLink(
      {} as never,
      ACTOR_ID,
      CONNECTION_ID,
      [COURSE_ID, SECOND_COURSE_ID],
      dependencies,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      contractVersion: 2,
      connectionId: CONNECTION_ID,
      added: 2,
      removed: 0,
    });
    expect(dependencies.linkEligibleUserCourses).toHaveBeenCalledTimes(1);
    expect(dependencies.linkEligibleUserCourses).toHaveBeenCalledWith(
      {},
      ACTOR_ID,
      CONNECTION_ID,
      [COURSE_ID, SECOND_COURSE_ID],
    );
    expect(dependencies.touchUserLastSync).toHaveBeenCalledWith(
      {},
      ACTOR_ID,
      '2026-07-21T18:00:00.000Z',
    );
  });

  it('rejects an outsider course with 403 without touching sync state or retrying a subset', async () => {
    const dependencies = linkDependencies({
      linkEligibleUserCourses: vi.fn(async () => Promise.reject({ code: '42501' })),
    });

    const response = await executeEligibleCourseLink(
      {} as never,
      ACTOR_ID,
      CONNECTION_ID,
      [COURSE_ID, SECOND_COURSE_ID],
      dependencies,
    );

    expect(response.status).toBe(403);
    expect(dependencies.linkEligibleUserCourses).toHaveBeenCalledTimes(1);
    expect(dependencies.linkEligibleUserCourses).toHaveBeenCalledWith(
      {},
      ACTOR_ID,
      CONNECTION_ID,
      [COURSE_ID, SECOND_COURSE_ID],
    );
    expect(dependencies.touchUserLastSync).not.toHaveBeenCalled();
  });

  it.each([
    ['22023', 422],
    ['P0002', 404],
    ['23503', 404],
  ])('maps database error %s to HTTP %i', async (code, status) => {
    const dependencies = linkDependencies({
      linkEligibleUserCourses: vi.fn(async () => Promise.reject({ code })),
    });

    const response = await executeEligibleCourseLink(
      {} as never,
      ACTOR_ID,
      CONNECTION_ID,
      [COURSE_ID],
      dependencies,
    );

    expect(response.status).toBe(status);
    expect(dependencies.touchUserLastSync).not.toHaveBeenCalled();
  });

  it('returns 404 without invoking the command when the authenticated profile is missing', async () => {
    const dependencies = linkDependencies({
      findUserById: vi.fn(async () => null),
    });

    const response = await executeEligibleCourseLink(
      {} as never,
      ACTOR_ID,
      CONNECTION_ID,
      [COURSE_ID],
      dependencies,
    );

    expect(response.status).toBe(404);
    expect(dependencies.linkEligibleUserCourses).not.toHaveBeenCalled();
  });
});
