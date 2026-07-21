import { describe, expect, it, vi } from 'vitest';

import { parseActivityFeedPayload } from '../../../../supabase/functions/activity-feed/payload.ts';
import type { ActivityFeedRepository } from '../../../../supabase/functions/activity-feed/repository.ts';
import { getActivityFeed } from '../../../../supabase/functions/activity-feed/service.ts';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';

describe('activity-feed V1 contract', () => {
  it('accepts only the list use case and a bounded limit', () => {
    expect(parseActivityFeedPayload({ action: 'list' })).toEqual({ action: 'list', limit: 20 });
    expect(parseActivityFeedPayload({ action: 'list', limit: 50 })).toEqual({
      action: 'list',
      limit: 50,
    });

    for (const payload of [
      { action: 'list', userId: ACTOR_ID },
      { action: 'list', user_id: ACTOR_ID },
      { action: 'list', limit: 0 },
      { action: 'list', limit: 51 },
      { action: 'list', limit: 1.5 },
    ]) {
      expect(() => parseActivityFeedPayload(payload)).toThrowError(
        expect.objectContaining({ status: 422 }),
      );
    }
  });

  it('derives owner scope from the authenticated actor and returns the V1 DTO', async () => {
    const repository: ActivityFeedRepository = {
      listForActor: vi.fn(async () => [{
        createdAt: '2026-07-21T12:00:00.000Z',
        description: 'Sincronizacao concluida',
        eventType: 'sync_completed',
        id: '22222222-2222-4222-8222-222222222222',
        metadata: { jobId: '33333333-3333-4333-8333-333333333333' },
        title: 'Moodle atualizado',
      }]),
    };

    await expect(getActivityFeed(repository, ACTOR_ID, {
      action: 'list',
      limit: 10,
    })).resolves.toEqual({
      contractVersion: 1,
      items: [expect.objectContaining({ eventType: 'sync_completed' })],
    });
    expect(repository.listForActor).toHaveBeenCalledWith(ACTOR_ID, 10);
  });
});
